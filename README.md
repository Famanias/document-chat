# Grounded

Grounded is a small document-chat application for asking questions of PDF, TXT, and Markdown files. It preserves source location metadata during ingestion, retrieves evidence with pgvector, streams a document-grounded answer, and renders the exact supporting passages as expandable cards inside the conversation.

## Live demo

**Vercel:** [https://document-chat-eta.vercel.app](https://document-chat-eta.vercel.app)

The application is configured for Vercel Hobby and Neon Free; see [Deployment](#deployment).

## Local setup

Requirements: Node.js 22+, npm, a [Neon](https://neon.com/) PostgreSQL database, and an [OpenRouter](https://openrouter.ai/keys) API key.

```bash
npm install
cp .env.example .env.local
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Set these server-only environment variables:

```dotenv
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
OPENROUTER_API_KEY=your_openrouter_key
```

Optional overrides are `OPENROUTER_CHAT_MODEL` (default `openrouter/free`) and `OPENROUTER_EMBEDDING_MODEL` (default `liquid/lfm-2.5-embedding-350m:free`). The defaults are useful for no-cost smoke testing, but free-route quotas and model selection can change. For an evaluator-facing deployment, use an OpenRouter account with credits and pin a currently available tool-capable chat model. Embeddings use the model's native 1,024 dimensions.

Create a Neon project, copy its pooled connection string into `DATABASE_URL`, then run:

```bash
npm run db:migrate
npm run dev
```

The migration enables `pgvector`, creates the tables, and adds a cosine HNSW index. Open [http://localhost:3000](http://localhost:3000).

## Architecture

The application uses the Next.js App Router with a static client shell and server-side Route Handlers. Database, parsing, embeddings, retrieval, and model calls stay in server-only modules. `@neondatabase/serverless` uses Neon's HTTP transport, so connections are safe for serverless invocations and do not depend on a long-lived pool.

```text
Upload
  → validate size/type/content
  → extract text while preserving page/section boundaries
  → chunk each source segment with overlap
  → embed in batches
  → transactionally store document + chunks + vectors in Neon

Question
  → persist user message
  → embed query
  → pgvector cosine search scoped to the chat's documents
  → AI tool selects supporting retrieved IDs
  → stream grounded answer
  → persist the completed UI message + tool output
  → render answer + expandable evidence cards
```

Important boundaries:

- `src/lib/documents`: upload validation, parsing, chunking, and transactional storage
- `src/lib/ai`: embedding, vector retrieval, and the evidence-selection tool
- `src/lib/chat`: chat/message persistence and UI-message reconstruction
- `src/lib/workspaces`: server-only workspace resolution and ownership lifecycle
- `src/app/api`: narrow HTTP validation and orchestration
- `src/components/chat`: conversation, composer, state, and evidence UI
- `migrations`: PostgreSQL and pgvector schema

The client sends only the newest user message. The server resolves workspace identity independently of client input, strictly validates the text-only request, reloads workspace-scoped trusted history, validates the reconstructed AI SDK UI messages, and uses stable message IDs with workspace-and-conversation-scoped database upserts. This prevents duplicate, cross-workspace, or cross-conversation message updates when a stream finishes or the page reloads. `consumeStream()` lets server-side completion and persistence continue if the browser disconnects. Only completed, non-empty assistant messages are stored; failed responses keep the user's question and expose a retry action without leaving a blank assistant row. Provider reasoning is neither sent to the browser nor persisted.

## Database schema

- `workspaces`: ownership roots resolved only on the server
- `documents`: workspace ID, filename, MIME type, size, full extracted text, page count, processing status, timestamps
- `document_chunks`: workspace ID, ordered content, page/section metadata, and a `vector(1024)` embedding
- `chats`: workspace ID, optional title, and activity timestamps
- `chat_documents`: workspace-owned many-to-many link that scopes retrieval to the open conversation
- `messages`: workspace ID, role, readable text, and AI SDK UI `parts` in `structured_data` JSONB so tool evidence survives reloads

Composite foreign keys prevent links, chunks, or messages from crossing a workspace boundary. Workspace deletion cascades through its complete graph without affecting other workspaces. The temporary pre-auth resolver maps the existing unauthenticated UI to one seeded demo workspace; guest and member identity will replace that narrow adapter later. The schema includes workspace-first indexes for scoped access plus HNSW cosine search.

## Document processing

- **PDF:** `unpdf` returns an array of page texts. Every page becomes its own source segment before chunking, so a chunk never loses its page number. Image-only PDFs return a clear unsupported/OCR message.
- **Markdown:** ATX headings (`#` through `######`) are tracked as a hierarchy such as `Product › Limits`; that section path follows every resulting chunk.
- **TXT:** the filename and exact excerpt provide source context; page/section fields remain null.

Files are limited to 4 MB to fit comfortably below Vercel's request body limit. PDFs are capped at 150 pages, and indexing is capped at 300 passages (roughly 100k tokens) so synchronous embedding work remains bounded by the 60-second route budget. Text files must be valid UTF-8. Filenames are normalized, MIME type and extension are cross-checked, PDF magic bytes are verified, and binary-looking text is rejected.

## Retrieval strategy

Chunks target 1,000 characters (about 250 tokens) with 150 characters (about 40 tokens) of overlap. Splits prefer paragraph, sentence, newline, then word boundaries. Chunking happens independently inside each PDF page or Markdown section; metadata is never inferred later. The smaller target stays safely within the default free embedding model's 512-token input window.

Document and query embeddings use `liquid/lfm-2.5-embedding-350m:free` through OpenRouter at its native 1,024 dimensions. Embedding requests are batched at 32 chunks. Chat uses the tool-capable `openrouter/free` router by default; both model IDs can be overridden without code changes.

For each question, the server performs cosine similarity search and retrieves the top six chunks across documents attached to that chat. This version intentionally avoids hybrid search and reranking. A strict prompt treats document text as untrusted data and forbids outside knowledge.

## Citation and structured UI strategy

Retrieved rows receive request-local labels (`E1`–`E6`). The AI is forced to call the `showEvidence` tool in its first generation step with the IDs it intends to use; a second step streams the readable answer. Tool execution validates those IDs against an in-memory map of actual retrieved rows and returns only server-owned metadata:

- document and chunk IDs
- filename
- PDF page or Markdown section
- chunk index
- exact excerpt
- cosine similarity (retained as server-side retrieval diagnostics)

The model cannot supply or modify citation metadata. Invalid IDs are discarded. The tool result is stored as an AI SDK UI message part and rendered as expandable evidence cards, which are the authoritative citations and remain identical during streaming and after a reload. The cards show filename, source location, and exact excerpt. They intentionally omit a percentage because raw cosine similarity is useful for ranking but is not calibrated answer confidence. Inline labels are also omitted: credentialed multi-chunk testing showed that a free routed model could swap `E1` and `E2` in prose even when it selected the correct chunks, while the server-owned cards retained the correct source metadata.

If no evidence supports the question, the prompt requires: “I couldn't find that in the uploaded document.” The tool selects no cards, avoiding a misleading citation.

## Key trade-offs

- Ingestion is synchronous to keep the five-hour version understandable. A production system would use a queue and resumable processing for larger files.
- Top-six semantic search is predictable and adequate for small documents; no keyword search, reranker, or answer-confidence classifier was added.
- The application supports multiple documents per chat, but does not include document deletion or re-indexing controls.
- Full extracted text and embeddings live in Postgres. No local filesystem or object storage is required.
- Authentication, identity lifecycle, billing, and admin features are deliberately out of scope. Persistence enforces workspace isolation, while the current pre-auth adapter still resolves all demo traffic to one shared workspace until guest/member identity is added.
- The UI uses plain streamed text rather than a full Markdown renderer, reducing dependencies and rendering risk.

## Verification

Run the complete local check:

```bash
npm test
npm run eval:retrieval:check
npm run typecheck
npm run lint
npm run build
```

Current result: 30 tests pass across ten files; the credential-free retrieval baseline, TypeScript, ESLint, and the Next.js production build pass. Tests cover:

- PDF text extraction with retained page number
- TXT extraction
- Markdown section hierarchy
- supported PDF/TXT/MD validation
- unsupported and oversized upload rejection
- extracted-text passage-limit rejection before embeddings are requested
- chunk boundaries, overlap, and source metadata
- citation-card filename, page/section, and excerpt rendering without a misleading confidence percentage
- strict chat-request validation, including malformed and oversized message parts
- stale conversation-load protection when users switch chats quickly
- plain-text answer normalization when a routed model emits stray Markdown markers
- strict chat-request validation, including malformed and oversized message parts
- stale conversation-load protection when users switch chats quickly
- plain-text answer normalization when a routed model emits stray Markdown markers
- runtime validation of versioned PDF/TXT/Markdown retrieval cases
- shared cosine ranking, retrieval recall, evidence correctness, and no-answer evidence selection

See [`evaluation/retrieval/README.md`](evaluation/retrieval/README.md) for the fixture coverage table, baseline interpretation, case-authoring process, and explicit credentialed answer-evaluation command.
The production server was also tested in isolated desktop and mobile browsers: `/` and application APIs responded normally, no application console exceptions appeared, layouts had no horizontal overflow, and an unsupported upload returned 415 with a clear error.

Credentialed verification was also completed against Neon and OpenRouter:

- PDF, TXT, and Markdown uploads returned 201 and persisted ready documents; CSV returned a clear 415.
- A controlled two-page PDF produced two page-scoped chunks and citation cards pointing to the correct page excerpts.
- An explicit fact question returned the correct USD 2.4 million budget and June 30, 2027 deadline.
- A multi-page question retrieved both page 1 and page 2 and answered with the correct budget, date, risk, and mitigation.
- An unsupported CEO-favorite-color question returned “I couldn't find that in the uploaded document.” with zero evidence cards.
- Markdown evidence retained the `Launch Plan › Ownership` section; TXT evidence correctly omitted page/section.
- Streaming produced progressive AI SDK data events and `[DONE]`; reloading the chat API retained messages and structured evidence without duplicates.
- Empty, malformed, binary-looking, oversized, and mismatched files failed with bounded 4xx responses; a 174 KB text document indexed successfully.
- One routed free-model request failed mid-stream during stress testing. The hardened implementation now preserves the question, avoids persisting an empty assistant message, and offers a retry. The same run exhausted the account's free-model daily quota, so quota must be restored before the public demo is submitted.

## Deployment

1. Create a Neon Free project and run `npm run db:migrate` against its connection string.
2. Import the Git repository into a Vercel Hobby project.
3. Add `DATABASE_URL` and `OPENROUTER_API_KEY` to Vercel Production, Preview, and Development as appropriate. For a stable public demo, use an account with credits and set `OPENROUTER_CHAT_MODEL` to a fixed, currently available tool-capable model.
4. Deploy with the Vercel dashboard or `vercel --prod`.
5. Check provider quota, then independently verify PDF/TXT/MD upload, reload persistence, direct/multi-part/unsupported retrieval, citation accuracy, streaming, and a forced provider error.

No persistent filesystem is used. Both long-running routes declare a 60-second maximum duration, and upload/page limits bound serverless memory and request time.

## Time spent

Total active assisted implementation, evaluator-style hardening, and verification time: approximately **95 minutes** (under the five-hour cap).

- Repository inspection, version-matched docs, schema, and plan — 8 minutes
- Document pipeline, embeddings, and storage — 14 minutes
- Chat, retrieval, streaming, persistence, and citations — 15 minutes
- UI states and responsive evidence experience — 8 minutes
- Credentialed testing, fixes, documentation, and deployment — 20 minutes
- Evaluator-style stress testing, reliability hardening, and final audit — 30 minutes

## AI tools used

- **OpenAI Codex:** repository inspection, implementation, code review, test authoring, and documentation
- **Codex skills:** version-matched Vercel AI SDK guidance, UI/UX guidance, and local desktop visual-QA tooling

All generated code was checked with the installed package documentation, strict TypeScript, ESLint, unit/component tests, and a production build.

## Example of correcting AI-generated output

The generated migration runner used `import { loadEnvConfig } from "@next/env"` inside an ESM `.mjs` file. Static checks did not exercise the script, but the first credentialed migration failed at runtime because this installed `@next/env` build is CommonJS and does not expose that named ESM export.

I replaced the named import with the package's default CommonJS interop import and destructured `loadEnvConfig` from it. This preserves Next's `.env.local` loading behavior and lets the migration run under the project's actual Node ESM runtime. The correction came directly from a reproduced failure during live verification.

## Known limitations and next steps

- No OCR for scanned PDFs.
- No background jobs, resumable indexing, progress events, or retry queue.
- No hybrid lexical/vector retrieval, reranking, or retrieval evaluation dataset.
- No guest/member authentication or identity lifecycle yet. Database and query ownership boundaries are in place, but the pre-auth demo adapter remains shared and must be replaced before exposing real private documents.
- No document deletion/re-indexing UI.
- The default free OpenRouter routes have tighter rate limits and variable latency/model selection. The stress audit exhausted the demo account's daily free-model quota; a credited account and fixed tool-capable model are required before submission.

With more time, the next work would be a small repeatable retrieval evaluation set, then an ingestion job with observable progress, followed by optional hybrid search only if the evaluation data justified it.
