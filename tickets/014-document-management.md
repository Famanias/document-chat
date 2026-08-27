# Ticket #14: Add document deletion and re-indexing controls

Issue: https://github.com/Famanias/document-chat/issues/14

Read [the shared protocol](README.md) first. Begin only after #3 and #10 are complete. Historical evidence is stored in message parts and must remain understandable when its source document is no longer active.

## Implementation sequence

1. Define document ownership and sharing semantics from the post-#3 schema: detaching from one chat, deleting the last workspace reference, and handling any shared document. Encode the decision in API behavior and database tests.
2. Add workspace-scoped delete and re-index operations. Delete chat links transactionally and remove unreferenced source/index data; re-index by creating a #10 job against retained private source data.
3. Publish a replacement index atomically only after successful processing. Keep the previous ready index searchable during work and recover cleanly from failure, retry, concurrent re-index, or delete.
4. Render historical evidence from stored message data after deletion, with an explicit unavailable-source state for interactions that require the removed document. Do not turn deletion into broken cards or foreign-resource lookups.
5. Add accessible controls, confirmation, pending/disabled states, progress, success, and retryable errors to each document row. Protect against double submission and stale UI responses.
6. Test two workspaces, shared links, last-link cleanup, retrieval exclusion, historical messages, re-index failure/success, duplicate requests, and chat/delete races. Update user and data-retention documentation.

## Design constraints

- Authorization belongs in the mutation and SQL scope, not only in button visibility.
- Deletion must be recoverable only where the product explicitly retains a source; accurately document permanent deletion behavior.
- Re-indexing reuses the durable job state machine and idempotency model.
- Preserve the active index until the replacement transaction commits.

## Required handoff evidence

Include deletion semantics, before/after row counts, historical evidence behavior, concurrent mutation results, re-index state transitions, accessibility proof, and complete quality-gate output.
