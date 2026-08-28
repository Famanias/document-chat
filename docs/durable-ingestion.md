# Durable document ingestion jobs

Document ingestion is structured as an asynchronous, resumable, workspace-scoped state machine.

## Ingestion Pipeline & Stages

```text
Upload Accepted (POST /api/documents)
  ├── 1. Validation (MIME, size, extension, chat scope)
  ├── 2. Private Staging (raw_source_bytes stored in ingestion_jobs)
  ├── 3. Enqueue Job (status: 'queued', progress: 0%)
  │
Worker Processing (processIngestionJob)
  ├── 4. Extracting (25% progress) — parseDocument (PDF / TXT / Markdown)
  ├── 5. Chunking (50% progress) — chunkSegments (hierarchical heading / page preservation)
  ├── 6. Embedding (75% progress) — embedDocumentChunks (OpenRouter vector embeddings)
  └── 7. Persisting (100% progress) — transactional write to document_chunks,
         document status -> 'ready', raw_source_bytes -> NULL, job status -> 'ready'.
```

## Lease & Recovery Semantics

- **Worker Lease**: When a worker claims a job, it acquires a time-bounded lease (`lease_expires_at`).
- **Resumability**: If a serverless instance shuts down mid-processing, the expired lease is eligible to be claimed by a new worker.
- **Idempotency**: Chunks for a document are atomically replaced inside a database transaction upon completion. Duplicate executions or retries never result in duplicate chunks, corrupted chat links, or orphaned embeddings.
- **Active Index Barrier**: Vector retrieval queries (`retrieveEvidence`) strictly filter on `documents.status = 'ready'`, ensuring incompletely ingested documents are invisible to chat Q&A.

## Private Staging & Retention

- Uploaded document binary payload is stored privately in `ingestion_jobs.raw_source_bytes` only for the duration of the ingestion pipeline.
- Upon reaching `ready` or during guest workspace deletion, `raw_source_bytes` is purged.
- When an entire guest workspace is ended or expired, foreign key cascades immediately purge the job and all associated artifacts.
