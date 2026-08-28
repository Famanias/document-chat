# Guest conversation claiming on sign-in

When a visitor transitions from an unauthenticated guest session to a member account (via sign-in or sign-up), their active guest conversation graph is atomically transferred to their member workspace.

## Transaction Boundary & Atomicity

```text
Visitor with Active Guest Session (cookie: grounded_guest)
                 │
                 ▼
   Sign-in / Sign-up / Claim API
                 │
                 ├── 1. Verify and establish member session
                 ├── 2. SELECT ... FROM guest_sessions WHERE credential_digest = $1 FOR UPDATE
                 ├── 3. Transfer chats row: workspace_id -> memberWorkspaceId
                 ├── 4. Transfer documents & document_chunks: workspace_id -> memberWorkspaceId
                 ├── 5. Transfer chat_documents links & messages: workspace_id -> memberWorkspaceId
                 ├── 6. Transfer any ingestion_jobs: workspace_id -> memberWorkspaceId
                 ├── 7. DELETE FROM guest_sessions
                 ├── 8. DELETE FROM workspaces (old guest workspace)
                 └── 9. Invalidate grounded_guest cookie
```

## Concurrency & Theft Protection

- **Row Locks**: The guest session row is locked with `FOR UPDATE` before any data mutations occur.
- **Single-Use Transfer**: Once claimed, the `guest_sessions` row is permanently deleted. Replaying the claim request returns the already claimed conversation idempotently to the owner or returns a safe 404 to non-owners.
- **Evidence Integrity**: All message structures, evidence parts, chunks, and citations remain unmodified across the transfer.
