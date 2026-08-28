# Document management: deletion and re-indexing

Document management provides explicit, workspace-scoped controls for deleting attached documents and triggering durable re-indexing.

## Deletion Semantics

```text
DELETE /api/documents/:id?chatId=:chatId
  ├── 1. Remove chat_documents link for (workspace_id, chat_id, document_id)
  ├── 2. Query remaining chat_documents references in the workspace
  └── 3. If zero remaining references:
           ├── Delete document_chunks for document_id
           ├── Delete ingestion_jobs for document_id
           └── Delete documents row for document_id
```

## Re-indexing Semantics

- Re-indexing uses `POST /api/documents/:id/reindex`.
- It reuses the durable ingestion pipeline (`ingestion_jobs`), creating a background/observable job.
- The existing ready chunks remain active and searchable for retrieval until the new job reaches `ready` and atomically updates the index inside a transaction.

## Historical Evidence Integrity

- Messages preserve evidence snippets and metadata in their structured parts.
- When an attached document is deleted, existing messages remain readable. Evidence cards continue to show captured citation excerpts and note source status cleanly without breaking the UI.
