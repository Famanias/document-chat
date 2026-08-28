# Grounded

Grounded is a document-chat application for asking questions about PDF, TXT, and Markdown files. It preserves page and section metadata during ingestion, combines pgvector and PostgreSQL full-text retrieval, streams a grounded answer, and renders server-validated supporting passages as expandable evidence cards.

## Live demo

**Vercel:** [https://document-chat-eta.vercel.app](https://document-chat-eta.vercel.app)

The deployment is designed to run on Vercel Hobby, Neon Free, and OpenRouter's free routes. Provider availability and quotas are therefore operational constraints rather than paid-away dependencies.

## Local setup

Requirements: Node.js 22+, npm, a [Neon](https://neon.com/) PostgreSQL database, and an [OpenRouter](https://openrouter.ai/keys) API key.

```bash
npm install
cp .env.example .env.local
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Set the required server-only variables:

```dotenv
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
OPENROUTER_API_KEY=your_openrouter_key
```

The application also reads these optional or operational variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_CHAT_MODEL` | `openrouter/free` | Chat and evidence-selection model. |
| `OPENROUTER_EMBEDDING_MODEL` | `liquid/lfm-2.5-embedding-350m:free` | 1,024-dimensional document and query embeddings. |
| `OPENROUTER_JUDGE_MODEL` | `openrouter/free` | Credentialed retrieval evaluation only. |
| `RETRIEVAL_MODE` | `hybrid` | `hybrid`, `vector`, or `lexical` candidate retrieval. |
| `GUEST_MAX_UPLOAD_BYTES` | `4194304` | Upload limit exposed to guest clients and enforced by the server. |
| `GUEST_MAX_MESSAGE_CHARACTERS` | `12000` | Question-length limit. |
| `GUEST_REQUESTS_PER_MINUTE` | `60` | Per-workspace, per-process request limit. |
| `MEMBER_AUTH_SECRET` | `DATABASE_URL`, then a development literal | HMAC key for prototype member-session cookies; set an independent secret outside local development. |
| `CRON_SECRET` | none | Required in production to authorize expired-guest cleanup. |

Create a Neon project, copy its pooled connection string into `DATABASE_URL`, then run:

```bash
npm run db:migrate
npm run dev
```

The migrations enable pgvector, create the workspace and ingestion schema, and add HNSW vector and GIN full-text indexes. Open [http://localhost:3000](http://localhost:3000).

## Architecture

The application uses the Next.js App Router with a client-side chat shell and server-side Route Handlers. Database access, parsing, embeddings, retrieval, authentication, and model calls stay in server-only modules. `@neondatabase/serverless` uses Neon's HTTP transport and does not require a long-lived connection pool.

```text
Upload request
  -> resolve the server-owned workspace and conversation
  -> validate extension, MIME type, size, and content
  -> create a document plus ingestion job and stage the source bytes in Neon
  -> claim the job and process it inside the same request
  -> extract -> chunk -> embed -> transactionally publish ready chunks
  -> clear staged bytes on success; retain them after failure for manual retry

Question
  -> persist the user message
  -> embed the query
  -> collect up to 24 vector and 24 full-text candidates
  -> fuse rankings with reciprocal rank fusion and keep the top six
  -> let the model select supporting evidence IDs through a tool
  -> validate those IDs against server-owned rows
  -> stream the answer and persist the completed message plus evidence parts
```

Important module boundaries:

- `src/lib/documents`: upload validation, parsing, PDF page handling, chunking, and document management
- `src/lib/ingestion`: durable job records, leases, stage updates, retries, and the ingestion worker function
- `src/lib/ai`: model configuration, embeddings, hybrid retrieval, ranking, and the evidence-selection tool
- `src/lib/chat`: chat/message persistence and AI SDK UI-message reconstruction
- `src/lib/workspaces`: server-side guest/member workspace resolution and guest lifecycle
- `src/lib/auth`: prototype member records, signed sessions, and guest-conversation claiming
- `src/lib/security`: origin validation, database rate-limit primitives, and log redaction
- `src/app/api`: HTTP validation and orchestration
- `src/components`: the chat, evidence, document-state, and authentication UI
- `src/evaluation` and `evaluation/retrieval`: versioned offline retrieval evaluation
- `migrations`: PostgreSQL, pgvector, ownership, ingestion, authentication, and full-text schema

The client never chooses a workspace ID. Every data operation resolves identity on the server and scopes SQL by workspace. Composite foreign keys prevent messages, chunks, chat-document links, jobs, and sessions from crossing workspace boundaries.

Guests receive a 256-bit HTTP-only browser credential; only its SHA-256 digest is stored. A guest gets one temporary conversation with a sliding one-hour inactivity expiry. Member mode provides a stable workspace and up to 50 listed conversations. Signing in or signing up atomically transfers the active guest conversation graph into the member workspace. See the authentication limitation below before treating member mode as production-ready.

The client sends only the newest user message. The server reloads trusted history, validates reconstructed AI SDK UI messages, and uses stable message IDs with workspace-and-conversation-scoped upserts. `consumeStream()` allows server-side completion to continue after a browser disconnect. Only completed, non-empty assistant messages are stored; a failed response retains the question and exposes retry without creating an empty assistant row. Provider reasoning is neither sent to the browser nor persisted.

## Database schema

- `workspaces`: ownership roots for all user data
- `guest_sessions`: credential digests, one guest conversation, activity, and expiry
- `member_accounts`: prototype email identity mapped one-to-one to a persistent workspace
- `documents`: filename, type, size, extracted text, page count, and processing status
- `ingestion_jobs`: staged source bytes, processing stage, progress, attempts, and worker lease
- `document_chunks`: source metadata, generated full-text vector, and `vector(1024)` embedding
- `chats`: workspace-owned conversations and activity timestamps
- `chat_documents`: workspace-owned many-to-many document attachments
- `messages`: readable text plus AI SDK UI `parts` in `structured_data` JSONB
- `rate_limit_buckets`: database-backed limiter storage; the current request handlers do not yet use it

Workspace deletion cascades through the complete graph. Ready documents keep extracted text and embeddings in Postgres; original upload bytes are removed when ingestion succeeds. Failed jobs retain source bytes so the same job can be retried.

## Document processing

- **PDF:** `unpdf` extracts text page by page. Chunks never cross a page boundary, so evidence retains its 1-based page number.
- **Markdown:** ATX headings (`#` through `######`) form a hierarchy such as `Product > Limits`; the section path follows each chunk.
- **TXT:** the filename and excerpt provide source context; page and section remain null.

The code includes a page-level OCR adapter seam and tests for mixed native/OCR page handling, but the production parser does not pass an OCR implementation. Image-only PDFs therefore remain unsupported, while sparse native text is indexed when present.

Files default to a 4 MiB limit. PDFs are capped at 150 pages, and indexing is capped at 300 passages. Text files must be valid UTF-8. Filenames are normalized, MIME type and extension are cross-checked, PDF magic bytes are verified, and binary-looking text is rejected.

## Retrieval strategy

Chunks target 1,000 characters with 150 characters of overlap. Splits prefer paragraph, sentence, newline, then word boundaries and run independently within each PDF page or Markdown section. This keeps chunks inside the free embedding model's 512-token input window while preserving source metadata.

The default `hybrid` mode runs two workspace-and-chat-scoped searches over ready documents:

1. pgvector cosine search returns up to 24 semantic candidates.
2. PostgreSQL English full-text search returns up to 24 lexical candidates.
3. Reciprocal rank fusion combines the two lists with equal weights and returns six evidence candidates.

`RETRIEVAL_MODE=vector` and `RETRIEVAL_MODE=lexical` are rollback/debugging options. The current implementation embeds the query before branching, so even lexical mode still depends on the embedding provider. Hybrid retrieval uses deterministic rank fusion; it does not include a learned or cross-encoder reranker.

## Citation and structured UI strategy

Retrieved rows receive request-local labels (`E1` through `E6`). In the first generation step, the model can call `showEvidence` with provided IDs. The tool discards unknown IDs and returns only server-owned metadata:

- document and chunk IDs
- filename
- PDF page or Markdown section
- chunk index
- exact excerpt
- similarity retained for diagnostics

The tool result is stored as an AI SDK UI-message part and rendered as expandable evidence cards. Cards remain identical during streaming and after reload. They omit a confidence percentage because cosine similarity and reciprocal-rank scores are ranking signals, not calibrated answer confidence.

If evidence does not support the question, the prompt instructs the model to select no cards and answer: "I couldn't find that in the uploaded document."

## Key trade-offs

- Ingestion state is durable and lease-based, but processing still runs synchronously inside upload/retry Route Handlers to avoid paid queue infrastructure.
- Hybrid retrieval improves exact-term coverage without another model call, but English `tsvector` configuration and equal-weight RRF are fixed heuristics.
- Original file bytes are kept only until successful ingestion, minimizing storage but preventing lossless reprocessing of a ready PDF without re-upload.
- Guest workspaces are private and temporary; persistence requires member mode, whose current identity flow is intentionally prototype-only.
- Full extracted text and embeddings live in Postgres. No local filesystem or paid object store is required.
- Answers use streamed plain text rather than a Markdown renderer, reducing dependencies and rendering risk.
- Free OpenRouter routes preserve the zero-budget constraint but make latency, quotas, model identity, and tool support variable.

## Verification

Run the complete local check:

```bash
npm test
npm run eval:retrieval:check
npm run typecheck
npm run lint
npm run build
```

The current unit, component, route, database, and evaluation suite contains **97 tests across 27 files**. Coverage includes:

- PDF/TXT/Markdown parsing, page/section preservation, chunking, and upload validation
- the OCR adapter seam and mixed-page behavior
- durable ingestion stages, failure recording, and raw-source retry behavior
- workspace isolation, guest expiry/cleanup, member workspaces, and atomic guest claiming
- document deletion and retry/re-index orchestration
- hybrid vector/full-text retrieval, RRF ranking, evidence validation, and the versioned retrieval dataset
- message reconstruction, citation-card persistence, streaming error states, and retry behavior
- model defaults, request limits, origin checks, redaction, and release-level isolation

The checked-in retrieval baseline is deterministic and credential-free. `npm run eval:retrieval:credentialed` additionally exercises the configured OpenRouter embedding, answer, and judge models, but it consumes free-provider quota and is not suitable as a reliable CI gate. See [`evaluation/retrieval/README.md`](evaluation/retrieval/README.md).

## Deployment

1. Create a Neon Free project and run `npm run db:migrate` against its pooled connection string.
2. Import the repository into a Vercel Hobby project.
3. Add `DATABASE_URL` and `OPENROUTER_API_KEY` to the required Vercel environments.
4. Set a dedicated `MEMBER_AUTH_SECRET` if member mode is exposed, and set `CRON_SECRET` before invoking guest cleanup in production.
5. Leave model overrides unset to use the zero-budget defaults, or choose other free model IDs with the required embedding dimensions and tool support.
6. Deploy, then verify upload, grounded questions, evidence cards, reload persistence, retry behavior, and provider-failure handling against the production URL.

No persistent filesystem is used. The upload and chat routes declare a 60-second maximum duration. The repository exposes `/api/cron/cleanup`, but it does not include a deployment scheduler configuration; an authorized scheduler must invoke it for abandoned expired guest workspaces to be physically removed.

## Time spent

The repository began as a time-boxed pilot and was expanded in later implementation passes. The original 95-minute estimate describes the pilot only and is not an accurate total for the current architecture.

## AI tools used

- **OpenAI Codex:** repository inspection, implementation, code review, test authoring, and documentation
- **Codex skills:** version-matched Vercel AI SDK guidance, UI/UX guidance, and local desktop visual-QA tooling

The repository's verification workflow uses the installed package versions with strict TypeScript, ESLint, automated tests, retrieval evaluation, and a production build.

## Example of correcting AI-generated output

The generated migration runner initially used a named ESM import from `@next/env`. Credentialed migration testing showed that the installed package build is CommonJS and does not expose that named export. The runner now uses the package's default CommonJS interop import and destructures `loadEnvConfig`, preserving Next's `.env.local` behavior under the project's Node ESM runtime.

## Known limitations and next steps

The repository has more functionality than the original pilot README described, but several pieces are scaffolding or demo-grade rather than production-complete.

### Known limitations

1. **Member authentication is not secure authentication.** The UI accepts a password, but the API neither stores nor verifies it; a normalized email address is currently sufficient to create or enter that member workspace. Session cookies are signed, but there is no password hash, email verification, account recovery, revocation store, or identity-provider validation. `MEMBER_AUTH_SECRET` also has development fallbacks.
2. **Ingestion jobs are durable but not background jobs.** Upload and retry handlers create/claim a job and then await `processIngestionJob()` in the same 60-second request. There is no separate worker, queue consumer, expired-lease sweeper, automatic backoff, or dead-letter flow. `max_attempts` is stored but not enforced by `retryJob()`.
3. **Ready-document re-indexing is not lossless.** Successful jobs delete `raw_source_bytes`. Failed-job retry works while those bytes remain, but a ready PDF cannot be faithfully rebuilt from extracted text. The general re-index path can create a replacement document record, and the UI exposes retry only for failed documents. The delete API exists, but ready-document delete/re-index controls are not exposed in the current document strip.
4. **OCR is not wired into runtime ingestion.** The OCR abstraction and page-level tests exist, but there is no concrete OCR adapter. Scanned/image-only PDFs therefore fail with no readable text.
5. **Free AI routes are a single external point of failure.** Upload indexing requires the free embedding model; questions require both embeddings and a free routed chat model capable of tool use. Free quotas, routing, cold starts, and availability can cause intermittent failures. There is no automatic free-model fallback list, retry backoff, or circuit breaker.
6. **Abuse controls are only partially integrated.** Active handlers use an in-memory fixed-window limiter, so limits are not shared across Vercel instances and reset on cold starts. A PostgreSQL limiter exists but is not called. Same-origin validation is applied to document deletion and re-indexing, not consistently to every state-changing route.
7. **Cleanup and observability need deployment wiring.** The expired-guest cleanup endpoint has no checked-in schedule. The redacted model-telemetry helper exists but chat and embedding calls do not emit through it, and there is no durable operational dashboard or alerting.
8. **Evaluation does not yet prove production hybrid-answer quality.** The committed offline baseline is controlled and vector-oriented; database tests cover hybrid retrieval, while credentialed answer judging is manual and provider-dependent. There is no committed before/after hybrid baseline or stable end-to-end production regression gate.
9. **Language and scale assumptions are narrow.** Full-text search uses PostgreSQL's `english` configuration, retrieval is capped at six final passages, uploads at 4 MiB/150 PDF pages/300 chunks, chat lists at 50 conversations, and all embeddings share one fixed 1,024-dimensional vector space.

### Zero-budget next steps, in priority order

1. Replace the email-only member flow with a real zero-cost identity boundary: verified OAuth/OIDC or a correctly hashed credential flow. Require an independent `MEMBER_AUTH_SECRET`, add revocation/rotation, and keep the existing workspace/claim interface behind it.
2. Separate job execution from the request path using a host-supported free scheduler or worker trigger. Add expired-lease recovery, enforce attempt limits, exponential backoff, and observable terminal errors while keeping ready chunks active until replacement succeeds.
3. Make re-indexing explicit and lossless: require re-upload of the original file after successful ingestion, or retain source bytes under a documented storage/retention policy. Atomically replace chunks on the same document instead of creating an ambiguous replacement record, then expose delete and re-index controls for ready documents.
4. Wire the PostgreSQL rate limiter and same-origin checks into every relevant mutation, distinguish guest and member policies, expire old rate buckets, and add route-level tests for the integrated controls.
5. Add a bounded open-source OCR adapter for text-insufficient pages, with strict page/time/memory limits suitable for the Hobby runtime and clear partial-document reporting.
6. Harden free-provider behavior with bounded retries, backoff, health-aware free-model fallbacks, clearer quota errors, and an embedding-availability check. Avoid any fallback that changes vector dimensions without a controlled re-index migration.
7. Configure authenticated guest cleanup and connect redacted telemetry at the actual chat/embedding call sites. Track job age, failure stage, provider outcome, and latency without recording prompts or document contents.
8. Add a versioned hybrid retrieval baseline, multilingual cases if supported, and repeatable end-to-end tests for upload-to-citation behavior. Use the results to tune RRF or justify a lightweight reranker rather than adding one by assumption.
