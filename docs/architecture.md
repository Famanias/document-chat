# System Architecture

Grounded is built with TypeScript and the Next.js App Router, using the Vercel AI SDK for model orchestration and streaming.

## High-Level Data Flow

```text
Upload Pipeline
  1. Route Handler resolves a server-only workspace context and verifies that the submitted chat ID belongs to it.
  2. User selects PDF, TXT, or Markdown document.
  3. Server validates MIME type, magic bytes, file size (<= 4MB), content, and a 300-passage synchronous-processing cap.
  4. Server extracts text while preserving source structure (PDF page numbers, Markdown headings).
  5. Chunker splits text into ~1,000 character blocks with 150 character overlap, scoped to source boundaries.
  6. Chunks are embedded in batches of 32 using OpenRouter (`liquid/lfm-2.5-embedding-350m:free`, 1024-dim).
  7. Workspace-owned document metadata, extracted text, chunks, vectors, and chat link are stored transactionally in Neon PostgreSQL.

Query & Retrieval Pipeline
  1. User sends a question in the chat interface.
  2. Route Handler resolves the workspace and loads the submitted chat with a workspace-scoped query; inaccessible IDs return the same 404 as missing IDs.
  3. Question is persisted to the database under that workspace.
  4. Query is embedded into a 1024-dimensional vector.
  5. Cosine similarity search retrieves the top 6 relevant chunks scoped to both the workspace and current chat.
  6. In Step 1, the AI is forced to call the `showEvidence` tool with the IDs of supporting chunks.
  7. The server validates evidence IDs and injects authoritative metadata (filename, page/section, excerpt, plus similarity for diagnostics).
  8. In Step 2, the AI streams a concise plain-text answer grounded strictly in the evidence.
  9. Only a completed, non-empty response and its structured evidence parts are persisted in Neon PostgreSQL; failed or aborted streams retain the user question without a blank assistant row.
  10. UI renders the response and expandable citation cards.
```

## Module Boundaries

- `src/lib/documents/`: Document parsing (`unpdf`, Markdown heading parser, UTF-8 text decoder), chunking, upload validation, and transactional persistence.
- `src/lib/ai/`: Embedding generation (`embeddings.ts`), vector retrieval (`retrieve.ts`), and AI SDK tool definitions (`evidence-tool.ts`).
- `src/lib/chat/`: Chat and message persistence, message reconstruction, and database interaction (`store.ts`).
- `src/lib/workspaces/`: Server-only workspace context resolution and lifecycle persistence. The temporary pre-auth adapter is the only identity-specific seam.
- `src/app/api/`: Server-only Route Handlers for chat streaming (`/api/chat`), document ingestion (`/api/documents`), and conversation management (`/api/chats`).
- `src/components/chat/`: React client components for conversation management, messaging, auto-scrolling, and evidence cards.

## Ownership Boundary

Route Handlers resolve workspace identity independently of request bodies and query strings. Stores require a `WorkspaceContext`, and ownership is applied inside SQL rather than by loading an unscoped row and checking it afterward. PostgreSQL composite foreign keys make cross-workspace message, chunk, and chat-document relationships invalid.

The current resolver maps all unauthenticated demo traffic to a seeded pre-auth workspace so visible behavior is unchanged. Future guest sessions and member authentication replace that resolver while retaining the same downstream store interface. See [Workspace Ownership](workspace-ownership.md) for the complete route and SQL inventory.
