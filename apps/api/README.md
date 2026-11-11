# `@line-13/api`

The optional AWS extension's request handlers. Additive by design: the web
application ships a complete bundled episode, and the first successful
playthrough needs nothing in this package (R6.5, R8.1, R8.4).

## Layering

```
API Gateway event
  -> runtime/lambda-adapter   drops headers, cookies, IP; decodes a base64 body
  -> handlers/*               transport-free functions over injected ports
  -> ports/*                  catalogue, manifest reader, replay store, counter,
                              clock, logger
  -> adapters/memory          the only adapters in the package
```

No handler imports an AWS type, reads the clock directly, or touches the
network. That is what makes the test suite deterministic, and it is why the
puzzle-truth path stays free of infrastructure concerns, per the ownership
boundaries in `.kiro/steering/architecture.md`.

`src/contracts.ts` is the single seam to `packages/contracts`. It uses a
relative path today so the suite runs on a bare checkout; swap it for the
`@line-13/contracts` workspace specifier once `node_modules` exists.

## Routes

| Route | Behaviour |
| --- | --- |
| `GET /v1/episodes/daily` | Resolves a UTC day (`?day=YYYY-MM-DD`, else the clock), reads the catalogue, fetches the manifest under a byte cap, then serves it only if schema validation and a three-way integrity check both pass. `ETag` is the manifest hash. |
| `GET /v1/replays/{replayCode}` | Normalises and validates the code before any read, then returns the stored event sequence, which is the whole replay because the graph engine is deterministic. |
| `POST /v1/endings` | The only write. Three identifier fields, every unknown key rejected, and the new aggregate returned from the atomic increment itself. |

## Failure behaviour

Every error is one of a closed set of codes with a fixed, pre-written message.
No message is built from request data, store data, or a caught exception's text,
so nothing can be reflected back and no internal detail can escape. Each body
carries `bundledFallback`, which tells the client when the correct recovery is
to play the bundled episode rather than leaving it to guess from a status code.

A manifest that fails validation or its integrity check is **rejected**, never
repaired and never partially served: a half-trusted puzzle is worse than no
puzzle when the client has a complete one bundled.

## Integrity

The manifest hash is SHA-256 over a canonical serialization of every field
except `integrity` itself. Canonical means sorted keys, preserved array order
(order is meaningful in a routing graph), no whitespace, and a loud rejection
of anything that cannot round-trip. Verification requires three values to
agree: the hash embedded in the manifest, the hash recorded at publication, and
the hash recomputed from the bytes actually fetched.

The bundled `minimal-episode.json` fixture is a **draft** — its proof is
unverified and its integrity block says `pending-publication` — and there are
tests asserting that both the verifier and the publication gate reject it as
one.

## Publication interfaces

`src/publication/` prepares the build-time AWS work without performing any of
it. Nothing in this package calls Polly or Bedrock.

- `speech.ts` builds Polly requests whose text **is** the manifest subtitle, so
  audio and subtitle cannot drift apart (R6.4), and whose output key is
  content-addressed over text, voice and engine, so republishing identical
  dialogue is a no-op and changed dialogue can never overwrite an asset a
  published manifest references.
- `draft-model.ts` restricts drafting to Amazon Nova by an allowlist prefix, so
  an unknown provider is rejected by default rather than missed by a blocklist
  (R6.1, R6.6). IAM enforces the same rule a second time.
- `gate.ts` is R6.3 as a pure function: schema validation, solver verification,
  solution count, unreachable nodes, integrity seal, subtitle presence, voice
  engine, safety review and human approval. It returns every blocker at once,
  so a pack is never published because one check was forgotten.

## Running the checks

```sh
cd apps/api
npm test        # 156 tests, no network, no credentials, no AWS call
npm run typecheck
```

`npm test` runs Node's own test runner over the TypeScript sources using Node
22's native type stripping, so it needs **no installed dependency at all**.
Verified on Node v22.23.2.

Two of the suites assert properties of the tree rather than of a function, and
are the reason the R6.6 and least-privilege claims are checkable instead of
merely stated:

- `test/provider-policy.test.ts` scans `src/**` and `infra/**` for third-party
  model vendors, endpoints and credential material. The test directory is the
  only place those names may appear, as the thing being prohibited.
- `test/infra-policy.test.ts` lints `infra/cloudformation/*.yaml`: no `Allow`
  statement with a wildcard action, no wildcard resource beyond the one
  documented Polly exception, no managed policy, no `logs:CreateLogGroup`, no
  identifying field in the access log format, and exactly the three routes. It
  reads the templates with a small YAML-subset statement reader, because this
  package installs nothing; a statement-count assertion makes an under-reading
  parser fail loudly rather than pass over an empty list. It is a lint over
  template text, not a policy evaluator and not a substitute for
  `cloudformation validate-template`.
`npm run typecheck` does need `typescript` and `@types/node`; they are declared
as dev dependencies but nothing has been installed, so that command is an open
gap rather than a passing check (see below).

## Gaps

1. **`npm run typecheck` has not been run.** No compiler is installed in this
   worktree and the task forbade installing packages. The sources are written
   against the repository's `tsconfig.base.json` (`strict`,
   `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`)
   plus `erasableSyntaxOnly`, which is what keeps them runnable under type
   stripping, but that is unverified by `tsc`.
2. **No SDK-backed adapters.** The DynamoDB and S3 implementations of the four
   store ports do not exist; only the in-memory ones do. See
   `infra/README.md` for the full deployment gap list.
3. **Replay codes are not minted here.** The API resolves a code; the
   publication pipeline writes the row.
