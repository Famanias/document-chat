# Ticket #8: Harden guest and member privacy and abuse controls

Issue: https://github.com/Famanias/document-chat/issues/8

Read [the shared protocol](README.md) first. Begin only after #5, #6, and #7 are complete. Centralize protections so every current and future route receives the same policy.

## Implementation sequence

1. Threat-model the actual route surface: identity resolution, uploads, chat streaming, conversation creation, claiming, cleanup, and provider calls. Completion means each issue acceptance criterion maps to a concrete enforcement point and test.
2. Add a shared, multi-instance rate-limit backend keyed by the least-sensitive stable identity available. Define separate configurable budgets for costly and cheap operations, plus bounded behavior when the limiter is unavailable.
3. Enforce same-origin state changes using the deployment's trusted origins and request metadata. Preserve valid same-origin uploads and streaming while rejecting cross-site mutations before side effects.
4. Normalize missing, unauthenticated, expired, and foreign-resource responses. Add private/no-store cache headers to personalized and temporary responses.
5. Introduce structured, redacted observability for cleanup, auth-provider, limiter, and upstream-model failures. Audit browser and server logging paths for credentials and content.
6. Build the adversarial test matrix from the issue, including concurrent quota attempts and replayed claims, then document tunable limits and operational alerts.

## Design constraints

- Rate limits must coordinate across serverless instances; in-memory counters may only be a test adapter.
- Apply authorization and origin checks before expensive parsing, embedding, or generation.
- Prefer consistent public errors and richer private error classification.
- New infrastructure or paid services require an explicit operator choice before provisioning or spending.

## Required handoff evidence

Include the threat matrix, limiter failure policy, origin-validation cases, cache headers, representative redacted events, concurrency results, and complete quality-gate output.
