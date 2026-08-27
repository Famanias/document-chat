# Ticket #7: Save the current guest conversation on sign-in

Issue: https://github.com/Famanias/document-chat/issues/7

Read [the shared protocol](README.md) first. Begin only after #4 and #6 are complete. The operation claims one guest workspace into an already resolved member workspace; authentication alone must never trigger a broad data merge.

## Implementation sequence

1. Preserve the guest claim credential across the sign-in redirect without exposing it to client logs, URLs, or another account. Bind the pending claim to the same browser flow.
2. Design one transactional claim operation. Lock the guest claim state, verify both guest and member identities again, move or re-own the complete conversation graph, and invalidate the guest credential only after commit.
3. Make the operation idempotent. A replay by the successful member may return the completed result; another member or an invalid credential receives a non-enumerating response.
4. Merge the claimed conversation into existing member history without duplicating chats, documents, chunks, links, messages, or structured evidence. Verify title, ordering, source metadata, and evidence after reload.
5. Add the "Sign in to save" path without interrupting the current conversation. Show retryable failure and completed states accessibly.
6. Test rollback at each mutation boundary, simultaneous claims, replay, cross-account theft, existing member history, redirect cancellation, reload, and guest credential invalidation.

## Design constraints

- Treat claim as a single-use ownership transfer, not a copy followed by best-effort cleanup.
- Database constraints and row locks must carry concurrency safety; process-local locks are insufficient.
- A failed transaction leaves the guest conversation usable and retryable.
- Keep stored AI SDK message parts byte-for-byte equivalent unless a schema migration explicitly requires normalization.

## Required handoff evidence

Include the transaction boundary, lock and idempotency strategy, rollback injection results, two-account attack tests, before/after row counts, reloaded evidence proof, and complete quality-gate output.
