# LINE 13 deploy evidence

Date: 2026-11-11. Account <ACCOUNT_ID>, region us-east-1 (profile default).

## Public URL

https://d38usbzsyul1ro.cloudfront.net (no login)

- CloudFront distribution: `E3B2JNO2MHT6KO`
- Bucket (private, OAC only): `line-13-prod-web-<ACCOUNT_ID>`
- Stack: `line-13-prod-site` (template `infra/cloudformation/web-hosting.yaml`)
- Leftover stack `line-13-prod-web`: ROLLBACK_COMPLETE, holds no resources. My first deploy failed on a wrong managed headers-policy id (fixed). The safety policy blocked me from deleting that stack, so I deployed under a new name. It is harmless and can be removed by you.
- Static site only. The API stack (`api.yaml`) and `content-storage.yaml` were not deployed.

## Merge

`feat/polly-voices` (f4f5369) merged into `feat/integration` as merge commit `99ffeb1`, with no conflicts.
After the merge: typecheck, unit tests, build and lint pass. Chromium E2E at 1440 and 390 passed 66/66 locally, with `--mute-audio`.
Later commits: `f7c293a` (BASE_URL option, mute), and the deploy commit that adds `web-hosting.yaml`, `scripts/deploy.mjs`, `npm run deploy` and the `infra/README.md` section (see git log).

## curl -I results

| Path | Status | content-type | cache-control |
| --- | --- | --- | --- |
| `/` | 200 | text/html | public, max-age=60 |
| `/assets/index-CnqQ114y.js` | 200 | text/javascript | public, max-age=31536000, immutable |
| `/audio/voices/0baa3ff5531529ea387bd921ca5de28c3ac6efbbfc0ed0d64362d2d7128f5231.mp3` | 200 | audio/mpeg | public, max-age=31536000, immutable |
| `/audio/voices/manifest.json` | 200 | application/json | public, max-age=60 |
| `/no/such/deep/path` | 404 | text/html (serves the game shell) | public, max-age=60 |

## Live E2E

`BASE_URL=https://d38usbzsyul1ro.cloudfront.net E2E_PROJECT_FILTER='chromium-(1440|390)' npx playwright test` -> 66 passed.
This covers intro skip, a correct route, all endings, mute, offline, accessibility, and a check that every request stays on the same origin.
A throwaway check (not committed) played a full night unmuted in the browser (Chromium `--mute-audio`) and saw 14 distinct voice mp3s load from CloudFront (206 range responses). The muted path is covered by the settings spec in the suite above.

## Budget

AWS Budget `line-13-monthly-5usd`, $5/month, created. Email to the owner at 80% actual and 100% forecast. Budget email subscribers need no confirmation.

## Monthly cost estimate

About $0.00 to $0.05 a month. Stored data is about 1.7 MB in S3 (cents at most). A visit transfers about 1.5 MB. 10,000 visits is about 15 GB, well inside the CloudFront free tier (1 TB and 10M requests a month). There are no Lambda, DynamoDB or domain costs. Estimate, not billing data.

## Redeploy / teardown

- Redeploy: `npm run deploy`
- Teardown: `aws s3 rm s3://line-13-prod-web-<ACCOUNT_ID> --recursive` then delete stack `line-13-prod-site` with `aws cloudformation` (delete-stack is blocked for the assistant on this Mac; run it yourself). Delete the budget with `aws budgets delete-budget --account-id <ACCOUNT_ID> --budget-name line-13-monthly-5usd`.

## Skipped / not checked

- WebKit and Firefox against the live URL were not run, and the WebKit audio stub was not written (Chromium only, as asked).
- Optional API and content-storage stacks skipped, as the game needs no backend.
- No custom domain or WAF. The default `*.cloudfront.net` certificate is used.
- Not pushed to GitHub.
