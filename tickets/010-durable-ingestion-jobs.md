# Ticket #10: Make document ingestion asynchronous, resumable, and observable

Issue: https://github.com/Famanias/document-chat/issues/10

Read [the shared protocol](README.md) first. Begin only after #3 is complete. The deployed target is serverless, so a promise left running after an upload response is not a durable worker.

## Implementation sequence

1. Map the current synchronous path from `src/app/api/documents/route.ts` through validation, parsing, chunking, embeddings, and transactional storage. Separate deterministic stage functions from HTTP orchestration and identify retryable versus terminal failures.
2. Choose a Vercel/Neon-compatible durable job and private source-staging design. Document delivery guarantees, retention, cost, scheduler/worker invocation, and recovery before adding infrastructure. Request an operator decision before provisioning a new paid service.
3. Add forward schema support for workspace-scoped jobs, stage/progress, attempts, leases, errors safe for users, and source/index versions. Make duplicate delivery and expired-worker lease recovery explicit.
4. Change upload to validate, stage, enqueue, and return promptly. Build a bounded worker that advances durable stages and publishes the ready index atomically; retrieval continues to use only the active ready index.
5. Expose progress and retry through a narrow API and accessible document UI. Use polling, server events, or another installed Next.js-supported mechanism whose reconnect and cache behavior is tested.
6. Add deterministic worker tests for success, transient retry, terminal failure, duplicate delivery, lease expiry, resume, workspace isolation, and source cleanup. Verify interruption between every persisted stage.
7. Update architecture, database, deployment, and operations documentation.

## Design constraints

- Persist state before acknowledging work; process memory is not a queue.
- Keep source objects private and delete them according to documented success, failure, and guest-retention rules.
- Use idempotency keys and database transitions rather than assuming exactly-once delivery.
- Keep current PDF, TXT, and Markdown behavior and evidence metadata intact.

## Required handoff evidence

Include the job state machine, infrastructure rationale, duplicate/interruption results, progress behavior, source-retention proof, deployment worker configuration, and complete quality-gate output.
