# Technical Evaluation — Grounded Document Chat

**Evaluation date:** August 27, 2026  
**Reviewed revision:** local worktree based on `8d7cd43`, including the hardening changes described below  
**Production deployment:** [https://document-chat-eta.vercel.app](https://document-chat-eta.vercel.app)

## Executive evaluation

This is a strong, deliberately scoped take-home. The implementation has a coherent document-to-citation pipeline, keeps citation metadata under server control, uses appropriate Next.js server/client boundaries, and explains its trade-offs unusually well. Direct lookup, multi-part retrieval, abstention, exact PDF page citations, Markdown sections, streaming, and reload persistence all worked in credentialed production testing.

The submission is not ready to hand to an evaluator today because the deployed OpenRouter account exhausted its free-model daily quota during the stress audit. New embeddings and answers therefore cannot be relied on until quota is restored. The free chat router also selected a model that failed one request mid-stream. The application now recovers cleanly from that failure, but clean recovery is not a substitute for an operable demo.

**Recommendation: FIX BEFORE SUBMITTING.** Restore provider capacity, pin a current tool-capable chat model, rerun a short production retrieval suite, and commit/push the hardened worktree.

## What was evaluated

The review covered the complete source tree, migrations, environment setup, README, modular documentation, available development history, installed Next.js 16.3.3 and AI SDK 7 APIs, local automated checks, local production mode, and the public Vercel deployment.

Production exercises included:

- PDF, TXT, and Markdown ingestion
- empty, invalid, malformed, binary-looking, oversized, and MIME-mismatched files
- a malformed PDF and a controlled two-page PDF
- a 174 KB text document that produced 125 chunks
- a synthetic document above the new 300-passage processing limit
- direct lookup, multi-part questions, similar-concept wording, and unsupported questions
- streamed event inspection and reload persistence
- duplicate-message and citation-persistence inspection
- desktop and 375 px mobile layouts, browser console, runtime exceptions, failed network requests, overflow, accessible names, and target sizes
- a scan of shipped browser bundles for exposed server credentials

Automated verification after the changes:

| Check | Result |
| --- | --- |
| Vitest | 18/18 tests passed across 7 files |
| TypeScript | `tsc --noEmit` passed |
| ESLint | Passed with no warnings or errors |
| Next.js production build | Passed on Next.js 16.3.3 |
| Vercel build/deploy | Passed; production alias updated |
| Post-deploy root and chat-list APIs | HTTP 200 |
| Post-deploy malformed chat request | HTTP 400 with safe message |
| Post-deploy 320-passage upload | HTTP 413 before embedding |
| Mobile browser check | 375 px viewport, no overflow, no console/runtime/network failures; Add document target 46×44 px with an accessible name |

## Improvements made during this evaluation

### Reliability

- Replaced permissive chat request parsing with strict text-only validation, UUID checks, and a 12,000-character question limit. The production endpoint returned 500 for `{ parts: [null] }` before this change and now returns a bounded 400.
- Persisted a new user question before retrieval/model work. Provider failure no longer silently loses the question.
- Persist only completed, non-empty assistant messages. A routed-model failure had previously left a blank assistant message in persisted history.
- Added a retry path that reuses the stored user message without inserting it again.
- Disabled provider reasoning in the client stream and persistence.
- Added an immediate send lock so two rapid submissions cannot pass through before React/AI SDK status updates.
- Prevented delayed chat loads from replacing a newer selection and prevented an upload completion from attaching UI state to the wrong active conversation.
- Scoped message upserts to the same conversation and role, preventing a known message ID from mutating a different conversation.
- Added a 300-passage cap before embeddings. This bounds synchronous processing to roughly 100k tokens and turns a likely Vercel timeout for text-heavy files into a clear 413.

### Citation and UX quality

- Removed the displayed “semantic match” percentage. Raw cosine similarity is useful for ranking but is not calibrated confidence, so presenting it as a percentage overstated what the number meant.
- Kept filename, PDF page or Markdown section, and exact excerpt as the visible verification surface.
- Normalized common stray bold and heading markers emitted by routed models while retaining the intentionally plain-text renderer.
- Added a visible Retry action for failed answers and accurate failure copy.
- Added accessible names to the mobile document action and hidden file input; increased error-action targets to 44 px.

### Submission clarity

- Made `.env.example` trackable instead of accidentally ignoring it with `.env*`.
- Updated the README and architecture/deployment/retrieval notes to explain completed-only persistence, diagnostic-only similarity, the passage cap, provider quota risk, stable-demo configuration, and the expanded tests.
- Deployed the hardened implementation to the stated production alias.
- Removed all audit-only production conversations and `audit-*` documents after testing.

## Scoring

| Category | Score | Findings |
| ---------------------------- | ----: | -------- |
| Functionality & reliability | 7.5/10 | Core flows, persistence, streaming, invalid-input handling, and recovery are sound after hardening. The score is capped because the live demo currently lacks provider quota, one free-routed model failed mid-stream, and provider/DB behavior is covered mainly by manual rather than automated integration tests. |
| Retrieval & citation quality | 8/10 | Direct, multi-part, PDF-page, Markdown-section, and unsupported cases passed with source-accurate cards. It is below 9 because the similar-concept run was interrupted by a provider failure, there is no repeatable evaluation set or similarity threshold, and top-six vector retrieval can be crowded by related chunks. |
| TypeScript & architecture | 8.5/10 | Boundaries are clear, no explicit `any` was found, server secrets remain server-side, and transactions/scoped retrieval are well chosen. It is below 9 because database result typing and persisted JSON reconstruction still rely on assertions, two client components are fairly large, and route-level integrations are not automated. |
| UX & product judgment | 8.5/10 | The upload → process → ask → stream → inspect flow is clear, responsive, and evidence-focused. It is below 9 because the unauthenticated deployment is a shared workspace, the mobile drawer lacks full dialog focus management, and a provider outage still prevents the primary task even though the error state now recovers cleanly. |
| Clarity of decisions | 9/10 | The README explains setup, schema, pipeline, retrieval/citation design, trade-offs, time, AI use, limitations, and why key decisions were made. The documented AI correction is real and traceable to development history. |

## Detailed findings

### 1. Functionality and reliability

#### Verified behavior

- PDF, TXT, and Markdown uploads returned 201, persisted as ready documents, and remained attached to the correct chat after reload.
- The controlled two-page PDF extracted into two page-scoped chunks. A page-two fact (“73 units”) was answered correctly and cited page 2.
- CSV returned 415; empty TXT returned 400; malformed PDF returned 422; invalid UTF-8 returned 422; and a file above 4 MB returned 413.
- The new extracted-content cap returned 413 for a 320-passage, sub-4 MB TXT before invoking embeddings.
- A 174 KB TXT indexed successfully into 125 chunks. This is a useful larger-document result, though it does not prove every document near the maximum will finish inside 60 seconds.
- Asking before a chat had a ready document returned 409 instead of starting an invalid model request.
- One successful answer streamed through 187 AI SDK events with 71 progressive text deltas.
- After eight persisted messages, reload returned eight unique message IDs in the correct role order; structured evidence was still present and no duplicate assistant appeared.
- Multiple consecutive questions worked. An unsupported question succeeded immediately after an unrelated routed-model failure, showing the chat did not remain stuck.
- The deployed browser shell produced no application console errors, runtime exceptions, or non-cancelled failed requests in isolated desktop/mobile sessions.
- No server credential marker was found in downloaded client JavaScript bundles.

#### Remaining reliability concerns

- **Current provider capacity is exhausted.** The OpenRouter response reported the account's `free-models-per-day` quota at its limit. Uploads need the embedding provider and answers need both embedding and chat providers, so the main production flow is not currently dependable.
- `openrouter/free` is intentionally variable. During the audit, one selected model failed after the stream began, and other successful models ignored the plain-text formatting instruction. The UI now handles both cases, but evaluator behavior remains nondeterministic until the model is pinned.
- Ingestion is synchronous. The new 300-passage cap makes the failure boundary defensible, but a background job would be required for substantially larger inputs or guaranteed retries.
- There is no automated route test with a real or emulated Neon/AI provider. Unit and component coverage catches the regressions found here, but not schema drift, provider payload changes, transaction failure, or a complete stream/reload cycle.
- All visitors share one public workspace. This is disclosed and authentication was explicitly out of scope, but real private documents must not be uploaded to this deployment.

### 2. Retrieval and citation quality

#### Pipeline trace

| Stage | Evaluation |
| --- | --- |
| Extraction | `unpdf` preserves a per-page array; Markdown tracks an ATX heading hierarchy; TXT remains unpaged. Image-only/malformed PDFs receive explicit errors. |
| Chunking | 1,600-character target with 200-character overlap; splits prefer natural boundaries and never cross a PDF page or Markdown section. This fits the embedding model's 512-token input limit with practical headroom. |
| Metadata | Page number/section is assigned before chunking and stored on every chunk. It is not inferred by the answer model. |
| Embedding | OpenRouter `liquid/lfm-2.5-embedding-350m:free`, native 1,024 dimensions, batches of 32. Database column dimensionality matches. |
| Retrieval | Cosine distance through pgvector, restricted by `chat_documents`, ready documents only, ordered by distance, top 6. The raw question is embedded without query rewriting. |
| Prompt context | Retrieved chunks are labeled request-locally as E1–E6. The prompt treats document content as untrusted, forbids outside knowledge, and requires an explicit abstention when unsupported. |
| Evidence selection | The model chooses retrieved IDs through a forced first-step `showEvidence` tool call. Unknown IDs are discarded against an in-memory server map. |
| Citation output | Filename, page/section, chunk index, and excerpt come from the retrieved database row. The model cannot author or alter them. The structured tool result persists with the message. |
| UI | Expandable cards expose the exact source location and excerpt. Raw similarity remains diagnostic and is no longer presented as calibrated confidence. |

#### Observed retrieval cases

- **Direct lookup:** Correct source chunks and answers were returned for controlled TXT, Markdown, and PDF facts.
- **Across chunks:** A budget/deadline question retrieved the distinct sections/pages needed and correctly combined both facts. A second case returned budget, date, risk, and mitigation from multiple passages.
- **Similar concepts:** The test document deliberately separated cobalt/Aurora from copper/Borealis. The provider failed during this request before an answer/evidence result was produced, and the later quota exhaustion prevented a clean rerun. This case remains unproven rather than failed.
- **Unsupported question:** “What is the CEO's favorite color?” returned exactly “I couldn't find that in the uploaded document.” and zero evidence cards.
- **Citation validation:** Tested cards used the exact uploaded filename, correct PDF page 2, correct Markdown heading path, and an excerpt present in the source. Persisted cards matched the source after reload.

#### Retrieval limitations

- There is no minimum similarity threshold. The model always receives up to six nearest chunks, including weak matches, and must decide whether to abstain. This worked in the unsupported test but makes grounding dependent on the selected chat model.
- Top 6 is global across all documents in the chat. Repetitive or semantically similar documents can crowd out complementary evidence.
- Evidence metadata is deterministic, but the model still decides which retrieved chunks to expose. A model can omit a relevant card even though it cannot fabricate the card's contents.
- There is no small regression corpus with expected chunk IDs, answer facts, abstention, and citation metadata. That is the highest-value retrieval improvement; hybrid search or reranking should wait until such data shows a need.

### 3. TypeScript and architecture

#### Strengths

- Server/client boundaries are appropriate. Database, provider, parsing, embedding, retrieval, and secrets live in `server-only` modules or route handlers.
- Concerns are separated into `documents`, `ai`, `chat`, API orchestration, UI components, and migrations without excessive abstraction.
- No explicit `any` was found in application TypeScript.
- The chat route reloads trusted history rather than accepting full client-provided history.
- Upload persistence is transactional: document, chat association, chunks, embeddings, and chat timestamp succeed or fail together.
- Retrieval is scoped in SQL to the current chat's attached, ready documents.
- Message IDs are stable, upserts are now conversation/role scoped, and only the newly completed assistant message is written.
- Installed Next.js and AI SDK documentation was followed; the deprecated result method was replaced with the installed AI SDK 7 stream conversion function.

#### Weaknesses

- Neon query results use several `as unknown as Row[]` assertions because the database client does not provide result inference here. The assertions are localized, but runtime row validation would be safer at trust boundaries.
- `structured_data.parts` is checked only as an array and then asserted to the AI SDK message-part type. Model-bound history is subsequently validated, but UI reconstruction could still be more defensive against manually corrupted database JSON.
- `chat-app.tsx` and `chat-conversation.tsx` are 279 and 310 lines respectively. They remain understandable, but each mixes several state concerns and is near the point where a small state hook could improve testability.
- Provider orchestration is correctly server-side but not injected, making route-level failure and stream tests more difficult.

### 4. UX and product judgment

#### Strengths

- The first action is clear, upload accepts only the advertised formats, and the question composer remains disabled until a document is ready.
- Uploading, ready, error, streaming, stopping, and retry states are visible and use user-facing language.
- The active document is visible in the conversation and evidence cards answer the three evaluator questions: which file, where, and what exact passage.
- Messages are readable; assistant output streams progressively; evidence remains visually secondary but inspectable.
- Desktop and mobile layouts had no horizontal overflow. Visible controls met the 44 px target in the focused mobile audit.
- Errors no longer leave a blank assistant entry or permanently locked composer.
- Removing the cosine “confidence” percentage is good product judgment: it reduces misleading technical leakage without hiding the actual evidence.

#### Weaknesses

- A fresh visitor enters a shared global chat list. This can be surprising even though the README discloses the single-workspace design.
- The mobile navigation drawer has an overlay and close action but not a full modal-dialog focus trap/Escape treatment.
- The main answer surface uses broad live-region behavior during token streaming, which may be noisy for screen readers.
- Plain text is a defensible dependency/safety choice, but routed models can still emit list markers or other Markdown conventions. A fixed model and stronger output evaluation are preferable to adding a full renderer solely for this issue.

### 5. Clarity of engineering decisions

The README is evaluator-friendly and covers the required local setup, environment variables, Neon/pgvector migration, provider configuration, module boundaries, schema, parsing/chunking/embedding/retrieval/citation pipeline, trade-offs, verification, deployment, time, AI use, limitations, and next steps.

The best explanations connect choices to the assignment's constraints:

- 1,600 characters plus 200 overlap balances natural context against a 512-token embedding window.
- Top 6 keeps prompt size predictable and avoids unjustified reranking complexity for small documents.
- Metadata is preserved before chunking because reconstructing page/section information later would make citations untrustworthy.
- Server-owned evidence cards were selected because model-written inline labels proved unreliable in credentialed testing.
- Synchronous ingestion is acknowledged as a five-hour simplification and is now bounded by file, page, and passage limits.
- Authentication, OCR, queues, hybrid search, and document-management controls are explicitly excluded rather than presented as forgotten production features.

One small process caveat remains: the hardening changes are deployed from the local worktree but are not yet committed to `master`. The submitted repository must match the tested deployment.

## AI-generated code correction example

This example is real and is supported by the available development handoff/history.

1. **What AI generated:** The migration runner used `import { loadEnvConfig } from "@next/env"` in an ESM `.mjs` script.
2. **Why it was wrong:** The installed `@next/env` package is CommonJS and did not expose that named ESM export in the project's actual Node runtime.
3. **How it was discovered:** Static TypeScript/lint/build checks did not execute the migration script. The first credentialed `npm run db:migrate` failed at runtime on the import.
4. **What changed:** The script now imports the package through its default CommonJS interop value and destructures `loadEnvConfig` from that value.
5. **Why the result is better:** It preserves Next's environment-file loading behavior while working in the actual ESM migration runtime. The correction was based on a reproduced failure rather than accepting generated code because it looked plausible.

## Critical issues

1. **The production provider quota is exhausted.** Until the OpenRouter account resets or receives credits, an evaluator cannot reliably upload a new document or generate an answer. This directly affects the application's primary task.
2. **The final similar-concept retrieval case and a fresh post-hardening model stream are not verified.** The provider failure/quota prevented completion. The non-model production routes and UI are verified, but the final model-dependent smoke test must be rerun after capacity is restored.
3. **The tested/deployed hardening is not committed to the repository.** Submitting the current `master` revision would omit the reliability fixes even though Vercel currently contains them.

## Recommended fixes before submission

1. Add OpenRouter credits or replace the key with one that has sufficient quota. Pin `OPENROUTER_CHAT_MODEL` to a current tool-capable model instead of `openrouter/free`, redeploy, and confirm the configured model can perform the forced `showEvidence` tool step.
2. Run one short production gate after redeployment: upload one PDF and one Markdown file, ask a direct question, the cobalt-versus-copper similar-concept question, a two-section question, and an unsupported question; verify exact cards and reload persistence.
3. Commit and push the current hardening changes and confirm the repository revision matches the Vercel deployment.

## Nice-to-have improvements

- Add a small provider/Neon integration suite with deterministic fake embeddings and a recorded AI SDK stream.
- Create a 10–20 question retrieval corpus before considering thresholds, hybrid search, or reranking.
- Add full focus management and Escape handling to the mobile conversation drawer.
- Validate persisted `structured_data` with a runtime schema before rendering it.
- Move ingestion to a background job only if the expected document size grows beyond the current five-hour-demo bounds.
- Add tenant isolation before allowing real private documents; authentication itself remains outside this assignment's requested scope.

## Strongest parts of the project

- Citation provenance is architecturally sound: the model selects IDs, but the server supplies immutable source metadata and excerpts.
- PDF page and Markdown section metadata survive the full extraction-to-reload pipeline.
- The design is appropriately simple: pgvector cosine top-K retrieval, no ornamental RAG machinery, and explicit trade-offs.
- The UI makes evidence inspectable without turning raw retrieval internals into fake confidence.
- Database transactions, chat scoping, stable message IDs, completed-only persistence, and disconnect consumption show good attention to serverless reliability.
- The README is candid about the five-hour scope and gives reasons for decisions rather than listing technology choices.
- The real AI correction example demonstrates runtime verification instead of blind trust in generated code.

## Weakest parts of the project

- The public demo depends on an exhausted free quota and a variable router, which is the most visible possible evaluator failure.
- Retrieval quality is supported by good manual cases but not by a repeatable evaluation harness; the similar-concept case remains incomplete.
- Synchronous ingestion and a 60-second serverless route constrain document scale despite the 4 MB transport limit.
- The shared unauthenticated workspace is acceptable for the assignment but inappropriate for private-document use.
- Runtime typing is strongest at HTTP inputs and weaker at database result/JSON reconstruction boundaries.

## Interview questions we should expect

1. **Why did you choose 1,600-character chunks with 200-character overlap?**  
   A strong answer should cover the embedding model's 512-token input window, roughly 400-token chunks, natural-boundary splitting, enough overlap for facts near boundaries, and the deliberate choice to avoid tuning without an evaluation set.

2. **Why is chunking constrained to each PDF page or Markdown section?**  
   Explain that source location is assigned during extraction, not guessed later; preventing cross-boundary chunks makes every citation location truthful even if it sometimes sacrifices context across pages.

3. **How can citations be trusted if an LLM chooses them?**  
   Distinguish evidence selection from metadata construction. The model may select only E1–E6, the server validates those IDs against retrieved rows, and filename/page/section/excerpt come from Neon. Mention that selection can still omit evidence, which is a remaining model-quality risk.

4. **Why top 6 cosine matches, and why no similarity threshold or reranker?**  
   Discuss predictable prompt size, small-document scope, observed multi-chunk coverage, and the five-hour constraint. Acknowledge that raw similarity is uncalibrated and that thresholds/hybrid search should be driven by a labeled retrieval set.

5. **How does pgvector retrieval remain scoped to the correct conversation?**  
   Walk through `document_chunks → documents → chat_documents`, filtering by chat ID and ready status, 1,024-dimensional vectors, cosine distance with `<=>`, and the HNSW cosine index. Note that the relational join is the authorization boundary only in this single-workspace demo.

6. **How do streaming and persistence avoid duplicate or blank messages?**  
   Cover stable AI SDK message IDs, saving the user before provider work, consuming the stream server-side after disconnect, persisting only the final completed non-empty assistant message, conversation/role-scoped upserts, and reload from stored structured parts.

7. **What race conditions did you find in the React client?**  
   Describe delayed chat requests replacing a newer selection, upload completion updating the wrong active chat, and rapid double submission before status propagated. Explain the request sequence/ref checks, captured chat ID, and immediate send lock.

8. **Why Neon HTTP and a transaction for ingestion?**  
   Explain serverless-compatible connections, no long-lived pool, pgvector in the same relational store, and the need for document metadata, chat association, chunks, vectors, and chat timestamp to commit atomically.

9. **How do Vercel constraints affect the upload design?**  
   Mention the 60-second route budget, 4 MB transport cap, 150-page PDF cap, 300-passage processing cap, batches of 32, synchronous simplicity for the take-home, and why larger production workloads need a queue with progress/retry semantics.

10. **What would you change about the model-provider configuration for production?**  
    A strong answer should cite the observed free-router stream failure and daily quota exhaustion, then propose a credited account, pinned tool-capable chat model, provider observability/timeouts, a smoke gate after deployment, and possibly separate providers only if operational requirements justify the added complexity.

## Final recommendation

**FIX BEFORE SUBMITTING**

Only these issues justify delaying submission:

1. Restore sufficient OpenRouter quota, pin a tool-capable chat model, redeploy, and pass the short production retrieval/citation smoke gate.
2. Commit and push the hardened worktree so the submitted source matches the tested production deployment.

