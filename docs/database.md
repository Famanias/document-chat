# Database Schema and Management

The application uses Neon serverless PostgreSQL with the `pgvector` extension.

## Tables

### `guest_sessions`
Maps an opaque browser-session guest credential to its single owned conversation.
- `credential_digest` (`CHAR(64)`, Primary Key): Lowercase SHA-256 digest; raw credentials are never stored.
- `workspace_id` (UUID, Unique Foreign Key -> `workspaces.id`): One workspace per guest session.
- `(workspace_id, chat_id)` (Unique Composite Foreign Key -> `chats(workspace_id, id)`): One same-workspace chat per guest session.
- `created_at` (TIMESTAMPTZ): Session creation timestamp; retention is implemented by ticket #5.

### `workspaces`
Ownership root for every persisted chat graph.
- `id` (UUID, Primary Key): Server-resolved workspace identifier.
- `created_at` (TIMESTAMPTZ): Workspace creation timestamp.
- Deleting a workspace cascades through its chats and documents, which cascade through links, chunks, and messages.

### `documents`
Stores document metadata and full extracted content.
- `id` (UUID, Primary Key): Unique document identifier.
- `workspace_id` (UUID, Foreign Key -> `workspaces.id` ON DELETE CASCADE): Owning workspace; part of unique key `(workspace_id, id)`.
- `filename` (TEXT): Original sanitized filename.
- `mime_type` (TEXT): MIME type (e.g. `application/pdf`, `text/markdown`, `text/plain`).
- `size_bytes` (INTEGER): File size in bytes.
- `extracted_text` (TEXT): Full text extracted from the document.
- `page_count` (INTEGER, Nullable): Total pages for PDFs, NULL for text/markdown.
- `status` (TEXT): Processing status (`processing`, `ready`, `failed`).
- `error_message` (TEXT, Nullable): Error details if processing failed.
- `created_at` (TIMESTAMPTZ): Ingestion timestamp.

### `document_chunks`
Stores segmented passages and vector embeddings.
- `id` (UUID, Primary Key): Unique chunk identifier.
- `workspace_id` (UUID): Owning workspace.
- `(workspace_id, document_id)` (Composite Foreign Key -> `documents(workspace_id, id)` ON DELETE CASCADE): Prevents a chunk from naming a document in another workspace.
- `chunk_index` (INTEGER): Zero-indexed order within the document.
- `content` (TEXT): Text content of the chunk (~1,000 characters max).
- `page_number` (INTEGER, Nullable): 1-indexed page number for PDFs.
- `section` (TEXT, Nullable): Heading hierarchy path for Markdown.
- `embedding` (VECTOR(1024)): 1,024-dimensional embedding vector.
- `created_at` (TIMESTAMPTZ): Chunk creation timestamp.
- Unique constraint: `(document_id, chunk_index)`.

### `chats`
Stores conversation records.
- `id` (UUID, Primary Key): Unique chat session identifier.
- `workspace_id` (UUID, Foreign Key -> `workspaces.id` ON DELETE CASCADE): Owning workspace; part of unique key `(workspace_id, id)`.
- `title` (TEXT, Nullable): Auto-generated from initial user message.
- `created_at` (TIMESTAMPTZ): Conversation creation timestamp.
- `updated_at` (TIMESTAMPTZ): Timestamp of latest message or document addition.

### `chat_documents`
Join table connecting documents to chat conversations.
- `workspace_id` (UUID): Owning workspace.
- `(workspace_id, chat_id)` (Composite Foreign Key -> `chats(workspace_id, id)` ON DELETE CASCADE).
- `(workspace_id, document_id)` (Composite Foreign Key -> `documents(workspace_id, id)` ON DELETE CASCADE).
- `created_at` (TIMESTAMPTZ): Link creation timestamp.
- Primary Key: `(chat_id, document_id)`.

The two composite foreign keys make a cross-workspace chat-document link unrepresentable in PostgreSQL.

### `messages`
Stores conversation messages with support for structured AI tool output.
- `id` (TEXT, Primary Key): Message identifier (e.g., client-provided ID or `msg_...`).
- `workspace_id` (UUID): Owning workspace.
- `(workspace_id, chat_id)` (Composite Foreign Key -> `chats(workspace_id, id)` ON DELETE CASCADE): Prevents a message from naming a chat in another workspace.
- `role` (TEXT): `user`, `assistant`, or `system`.
- `content` (TEXT): Readable text representation of the message.
- `structured_data` (JSONB): Full AI SDK UI parts payload containing tool invocations and evidence cards.
- `created_at` (TIMESTAMPTZ): Message timestamp.

## Indexes

- `document_chunks_embedding_hnsw_idx`: HNSW index on `embedding` using `vector_cosine_ops` for fast nearest-neighbor search.
- `document_chunks_document_idx`: B-Tree index on `(document_id, chunk_index)`.
- `messages_chat_created_idx`: B-Tree index on `(chat_id, created_at, id)`.
- `chats_updated_idx`: B-Tree index on `chats (updated_at DESC)`.
- `chats_workspace_updated_idx`: B-Tree index on `(workspace_id, updated_at DESC)` for scoped listing.
- `messages_workspace_chat_created_idx`: B-Tree index on `(workspace_id, chat_id, created_at, id)`.
- `document_chunks_workspace_document_idx`: B-Tree index on `(workspace_id, document_id, chunk_index)`.
- `chat_documents_workspace_chat_idx`: B-Tree index on `(workspace_id, chat_id, document_id)`.

## Migrations

Migrations are managed via numbered SQL files in `migrations/` and applied using `scripts/migrate.mjs` (`npm run db:migrate`).
- `001_initial.sql`: Creates extensions, tables, constraints, and indexes.
- `002_openrouter_embeddings.sql`: Adjusts embedding dimension to `VECTOR(1024)` for OpenRouter compatibility.
- `003_workspace_ownership.sql`: Creates `workspaces`, seeds the pre-auth demo workspace, adds and backfills ownership columns, makes them non-null, installs composite ownership constraints, and adds workspace-first indexes.
- `004_temporary_guest_conversation.sql`: Creates the digest-only guest-session mapping with unique workspace/chat ownership and composite isolation constraints.
- `005_guest_lifecycle.sql`: Adds `last_active_at` and `expires_at` (1-hour default) to `guest_sessions` with expiry indexing.
- `006_ingestion_jobs.sql`: Adds `ingestion_jobs` table for asynchronous, resumable, and observable ingestion pipeline.
- `007_hybrid_retrieval.sql`: Adds `content_tsv TSVECTOR` generated column and GIN index for PostgreSQL full-text search.
- `008_member_accounts.sql`: Adds `member_accounts` table mapping provider subjects to persistent workspaces.
- `009_deferrable_workspace_fks.sql`: Installs deferred foreign key constraints supporting atomic conversation graph claims.
- `010_rate_limits.sql`: Adds `rate_limit_buckets` table for multi-instance rate limiting.

`003_workspace_ownership.sql` is a forward, re-runnable migration. On an upgrade, all rows from the previously single-workspace schema are assigned to `00000000-0000-4000-8000-000000000001`; children derive ownership from their chat or document before constraints are installed. On a clean database, the same migration runs after `001` and `002`. Each migration file is applied in a transaction by `scripts/migrate.mjs`.

The migration test suite executes both paths against PostgreSQL-in-WASM with pgvector, then verifies composite-foreign-key attack failures and workspace cascade deletion. Runtime query ownership and Route Handler call paths are documented in [Workspace Ownership](workspace-ownership.md).
