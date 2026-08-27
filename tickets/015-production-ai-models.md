# Ticket #15: Pin and observe production AI models

Issue: https://github.com/Famanias/document-chat/issues/15

Read [the shared protocol](README.md) first. Begin only after #10 and #11 are complete. Selecting or purchasing a paid model is an operator decision; implementation must make that choice explicit and verifiable.

## Implementation sequence

1. Inventory every chat, embedding, reranking, and evaluation model call plus current environment defaults. Define environment-specific policy: explicit fixed production IDs and clearly marked optional development defaults.
2. Validate production configuration at startup or deployment build where secrets are available. Reject free/auto-routed production identifiers with an actionable error while keeping credentials server-only.
3. Record embedding model identity, dimensions, and index version with stored vectors. Prevent queries across incompatible spaces and route embedding changes through #10's replacement-index process.
4. Add bounded timeout, retry, and fallback policy per operation. Preserve safe user messages and distinguish rate-limit, provider, configuration, and terminal content-processing failures in redacted telemetry.
5. Record model ID, operation, duration, outcome, retry count, and rate-limit metadata without prompts, chunks, answers, evidence excerpts, credentials, or personal data.
6. Run #11 against proposed fixed models in an isolated preview. Record quality, latency, and estimated cost; exercise configuration failure and rollback to the previous fixed model/index.
7. Update environment, deployment, operations, and retrieval documentation with exact model-policy behavior but no secret values.

## Design constraints

- Do not silently substitute a different production model.
- Chat-model rollback and embedding-index rollback are distinct operations; document and test both.
- Keep the previous embedding index active until replacement evaluation and publication succeed.
- If no paid model or budget has been chosen, complete the configuration/versioning machinery and hand back a precise operator decision gate.

## Required handoff evidence

Include the model-call inventory, environment validation cases, embedding compatibility guards, redacted telemetry samples, evaluation comparison, latency/cost assumptions, rollback results, external decision status, and complete quality-gate output.
