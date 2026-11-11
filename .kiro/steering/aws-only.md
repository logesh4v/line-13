---
inclusion: fileMatch
fileMatchPattern: ["**/package.json", "infra/**", "apps/api/src/**", "packages/haunting/src/**"]
---

# LINE 13 AWS-Only Steering

Loaded when dependencies, infrastructure, backend, or audio generation code is touched.

- Voices: Amazon Polly only. Models, if any are needed: Amazon Nova through Amazon Bedrock only.
- No third-party model or voice SDK (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `elevenlabs`) in any package. `scripts/steering-guard.mjs` fails the save when one is imported in `src/`.
- Model and Polly calls are never on the request path of gameplay. The bundled episode must play with no network, backend, model call, or credential.
- No AWS credential, key id, or secret in source, fixtures, logs, bundles, or recordings. Role-based access only; each function gets the smallest action and resource set (`apps/api/test/infra-policy.test.ts` lints this).
- Agents working here make no AWS calls unless the task names them; plan and lint templates instead.
