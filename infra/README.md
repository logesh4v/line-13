# LINE 13 infrastructure

The optional AWS extension. Nothing here is on the judge's path: the web
application ships a complete bundled episode and a full playthrough needs no
account, no backend, no model call and no network beyond the static assets
(R6.5, R8.1, R8.4). If every stack in this directory is absent or failing, the
game is still finishable, and the client is told so explicitly rather than
being handed a quietly different puzzle (R8.3).

## Why CloudFormation and not CDK

The dependency rule in `.kiro/steering/architecture.md` asks for a package only
when it removes more risk than it adds. CDK would add a Node toolchain, a
bootstrap stack and a synthesis step to produce templates that are, for three
functions and three tables, readable on their own. These templates deploy with
the AWS CLI alone and can be reviewed without running anything.

## Stacks, in deployment order

| Order | Template | Creates |
| --- | --- | --- |
| 1 | `cloudformation/content-storage.yaml` | Private content bucket for episode manifests (`episodes/`) and immutable Polly audio (`audio/`) |
| 2 | `cloudformation/api.yaml` | Three DynamoDB tables, three Lambda functions with one role each, the HTTP API, routes and throttling |
| 3 | `cloudformation/publication-role.yaml` | The build-time role the reviewed publication pipeline assumes |

The publication role is deployed last because it references the table ARNs the
API stack outputs. It is a separate stack on purpose: it is the only principal
that can write content or call a model, and nothing that serves a request can
assume it.

```sh
aws cloudformation deploy \
  --template-file infra/cloudformation/content-storage.yaml \
  --stack-name line-13-prod-content \
  --parameter-overrides EnvironmentName=prod
```

`api.yaml` additionally needs `ContentBucketName`, `ContentBucketArn`,
`ArtifactBucketName`, the three artifact keys, and `AllowedOrigin` (a single
`https://` origin; a wildcard is rejected by the parameter pattern). Deploying
the roles requires `--capabilities CAPABILITY_NAMED_IAM`.

## Public web hosting (the judge path)

`cloudformation/web-hosting.yaml` is independent of the stacks above and is the
only one the public site needs: a private S3 bucket, a CloudFront distribution
with origin access control, the default `*.cloudfront.net` HTTPS certificate,
and a managed security-headers policy. A missing key returns a real HTTP 404
that still serves `index.html`, so a wrong deep link shows the game, not a blank page.

```sh
npm run deploy        # build, create/update stack line-13-prod-site, upload, invalidate
```

`scripts/deploy.mjs` uses the AWS CLI default profile and region. Hashed files
(`assets/*`, `audio/voices/*.mp3`) upload first with
`Cache-Control: public, max-age=31536000, immutable`; everything else
(`index.html`, `audio/voices/manifest.json`) uploads last with
`public, max-age=60`; then `/*` is invalidated. Source maps are not uploaded.
Override the stack with `STACK_NAME=...`.

Run the E2E suite against the live site with
`BASE_URL=https://<id>.cloudfront.net npm run e2e` (add
`E2E_PROJECT_FILTER=chromium` to skip WebKit/Firefox; Chromium runs with
`--mute-audio`).

Teardown: empty the bucket (`aws s3 rm s3://<bucket> --recursive`), then
delete the `line-13-prod-site` stack with the CloudFormation console or CLI.

## Routes

| Route | Function | Reads | Writes |
| --- | --- | --- | --- |
| `GET /v1/episodes/daily` | `daily-episode` | Episode table GSI, manifest object | nothing |
| `GET /v1/replays/{replayCode}` | `replay` | One replay item by key | nothing |
| `POST /v1/endings` | `ending-report` | nothing | One counter increment |

`?day=YYYY-MM-DD` on the daily route selects an explicit UTC day; omitted, the
current UTC day is used. All three routes are `AuthorizationType: NONE` because
there is no account and nothing private to protect.

## IAM scope

Every function has its own role, and no role holds a wildcard resource except
where the AWS API makes one unavoidable.

| Role | Granted | Deliberately not granted |
| --- | --- | --- |
| `daily-episode` | `dynamodb:Query` on the `published-day-index` GSI only; `s3:GetObject` on `episodes/*` only | Table-level reads, `Scan`, any write, the `audio/*` prefix, `s3:ListBucket` |
| `replay` | `dynamodb:GetItem` on the replay table | `Query` and `Scan`, so the table cannot be enumerated; every write |
| `ending-report` | `dynamodb:UpdateItem` on the counter table | Every read: the new total comes back from the atomic `ADD`, so no read is needed. Also no `DeleteItem` |
| `publication` | `bedrock:InvokeModel` on `amazon.nova-*` only, with an explicit `Deny` on every non-Amazon model; Polly synthesis; `s3:PutObject` on `episodes/*` and `audio/*`; `PutItem` on the episode and replay tables | Object deletion, bucket policy changes, model provisioning and marketplace subscription, anything in the request path |

Log groups are created by the templates, so no role holds
`logs:CreateLogGroup`, and each role can write only to its own group's streams.

Two limits worth stating plainly rather than hiding:

- `polly:SynthesizeSpeech` and `polly:StartSpeechSynthesisTask` accept no
  resource ARN, so their resource must be `*`. They are narrowed instead by
  action, by an `aws:RequestedRegion` condition, and by the role having exactly
  one assumable principal.
- `SSEEnabled: true` on the tables moves them from the AWS-owned key to the
  AWS-managed KMS key, which costs a little and buys a CloudTrail record of key
  use. Callers need no extra KMS permission for it.

## Privacy posture

- The API Gateway access log format carries `requestId`, `routeKey`, `status`,
  latency, response length and integration status. Source IP, user agent and
  request headers are absent by construction, as is the integration error
  message, which is the one access-log field that can carry a handler's
  internals (R10.4).
- The handler's request type models no header, cookie or IP field at all, so
  nothing identifying can reach a handler, a log line or a store. There is a
  standing test for this in `apps/api/test/privacy.test.ts`.
- The only write the API accepts is three identifier fields with every unknown
  key rejected, so an ending report cannot carry a nickname or a token.
- Nothing per-player is stored anywhere: the ending aggregate is a counter, and
  a replay record is an episode id plus an event sequence.

## Deployment gaps

These are open, and nothing here claims otherwise.

1. **No AWS SDK adapters.** The `EpisodeCatalogue`, `ManifestReader`,
   `ReplayStore` and `EndingCounterStore` ports have in-memory implementations
   only. The DynamoDB and S3 implementations are not written, because this
   package installs nothing and the task forbade adding packages. Until they
   exist, these templates deploy infrastructure that no artifact fills.
2. **No build or bundling step.** `Code` points at parameterised S3 artifact
   keys. Each package must contain an `index.mjs` at its root exporting
   `handler`, produced by bundling `createLambdaHandler(createXHandler(deps))`
   with SDK-backed adapters. The Node.js 22 Lambda runtime does **not** include
   the AWS SDK, so the SDK has to be bundled rather than assumed present. No
   bundler is chosen yet.
3. **No CloudFront distribution for audio from the content bucket.** `content-storage.yaml` accepts an optional
   `ReaderDistributionArn` and grants it origin-access-control reads on
   `audio/*`. Creating the distribution and the web-build origin belongs to
   whoever owns deployment, so the parameter defaults to empty and grants
   nothing.
4. **Replay codes are not minted here.** The API resolves a code; the
   publication pipeline writes the row. A player-facing "share my run" flow
   would need a fourth route and a seeded code generator, and is item 2 on the
   task plan's cut list.
5. **Nothing has been deployed or validated against AWS.** No template has been
   run through `cloudformation validate-template`, no credential was read, and
   no AWS call was made. The IAM and privacy properties above are checked by
   `apps/api/test/infra-policy.test.ts`, which lints the template text for
   wildcard grants, managed policies, `logs:CreateLogGroup`, identifying
   access-log fields and the route set. That lint is not a policy evaluator:
   parameter patterns, resource references and intrinsic functions are still
   reviewed by eye only, and a template that passes it can still fail to
   deploy.
6. **No alarms or budget.** CloudWatch metrics are enabled on the stage, but no
   alarm, dashboard or budget is defined.
