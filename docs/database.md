# Database Schema and Management

The application uses Neon serverless PostgreSQL with the `pgvector` extension.

## Tables

### `documents`
Stores document metadata and full extracted content.
- `id` (UUID, Primary Key): Unique document identifier.
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
- `document_id` (UUID, Foreign Key -> `documents.id` ON DELETE CASCADE).
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
- `title` (TEXT, Nullable): Auto-generated from initial user message.
- `created_at` (TIMESTAMPTZ): Conversation creation timestamp.
- `updated_at` (TIMESTAMPTZ): Timestamp of latest message or document addition.

### `chat_documents`
Join table connecting documents to chat conversations.
- `chat_id` (UUID, Foreign Key -> `chats.id` ON DELETE CASCADE).
- `document_id` (UUID, Foreign Key -> `documents.id` ON DELETE CASCADE).
- `created_at` (TIMESTAMPTZ): Link creation timestamp.
- Primary Key: `(chat_id, document_id)`.

### `messages`
Stores conversation messages with support for structured AI tool output.
- `id` (TEXT, Primary Key): Message identifier (e.g., client-provided ID or `msg_...`).
- `chat_id` (UUID, Foreign Key -> `chats.id` ON DELETE CASCADE).
- `role` (TEXT): `user`, `assistant`, or `system`.
- `content` (TEXT): Readable text representation of the message.
- `structured_data` (JSONB): Full AI SDK UI parts payload containing tool invocations and evidence cards.
- `created_at` (TIMESTAMPTZ): Message timestamp.

## Indexes

- `document_chunks_embedding_hnsw_idx`: HNSW index on `embedding` using `vector_cosine_ops` for fast nearest-neighbor search.
- `document_chunks_document_idx`: B-Tree index on `(document_id, chunk_index)`.
- `messages_chat_created_idx`: B-Tree index on `(chat_id, created_at, id)`.
- `chats_updated_idx`: B-Tree index on `chats (updated_at DESC)`.

## Migrations

Migrations are managed via numbered SQL files in `migrations/` and applied using `scripts/migrate.mjs` (`npm run db:migrate`).
- `001_initial.sql`: Creates extensions, tables, constraints, and indexes.
- `002_openrouter_embeddings.sql`: Adjusts embedding dimension to `VECTOR(1024)` for OpenRouter compatibility.
