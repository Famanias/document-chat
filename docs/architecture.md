# System Architecture

Grounded is built with TypeScript and the Next.js App Router, using the Vercel AI SDK for model orchestration and streaming.

## High-Level Data Flow

```text
Upload Pipeline
  1. User selects PDF, TXT, or Markdown document.
  2. Server validates MIME type, magic bytes, file size (<= 4MB), and content.
  3. Server extracts text while preserving source structure (PDF page numbers, Markdown headings).
  4. Chunker splits text into ~1,600 character blocks with 200 character overlap, scoped to source boundaries.
  5. Chunks are embedded in batches of 32 using OpenRouter (`liquid/lfm-2.5-embedding-350m:free`, 1024-dim).
  6. Document metadata, extracted text, chunks, and vector embeddings are stored transactionally in Neon PostgreSQL.

Query & Retrieval Pipeline
  1. User sends a question in the chat interface.
  2. Question is persisted to the database.
  3. Query is embedded into a 1024-dimensional vector.
  4. Cosine similarity search retrieves the top 6 relevant chunks scoped to documents in the current chat.
  5. In Step 1, the AI is forced to call the `showEvidence` tool with the IDs of supporting chunks.
  6. The server validates evidence IDs and injects authoritative metadata (filename, page/section, excerpt, similarity).
  7. In Step 2, the AI streams a concise plain-text answer grounded strictly in the evidence.
  8. Completed response and structured evidence parts are persisted in Neon PostgreSQL.
  9. UI renders the response and expandable citation cards.
```

## Module Boundaries

- `src/lib/documents/`: Document parsing (`unpdf`, Markdown heading parser, UTF-8 text decoder), chunking, upload validation, and transactional persistence.
- `src/lib/ai/`: Embedding generation (`embeddings.ts`), vector retrieval (`retrieve.ts`), and AI SDK tool definitions (`evidence-tool.ts`).
- `src/lib/chat/`: Chat and message persistence, message reconstruction, and database interaction (`store.ts`).
- `src/app/api/`: Server-only Route Handlers for chat streaming (`/api/chat`), document ingestion (`/api/documents`), and conversation management (`/api/chats`).
- `src/components/chat/`: React client components for conversation management, messaging, auto-scrolling, and evidence cards.
