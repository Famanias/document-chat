# Agent implementation briefs

This directory turns each open GitHub issue into an execution brief. The GitHub issue remains the source of truth for scope and acceptance criteria; the matching file here supplies repository context, sequencing, risks, and required proof.

## Shared protocol

1. Open the linked issue and read its latest body and comments. Start only when every blocker listed there is closed. Completion means the implementation matches the live issue, including later clarifications.
2. Read the root `AGENTS.md`, this file, and the ticket brief. Before changing Next.js code, read the relevant installed guide under `node_modules/next/dist/docs/` as required by `AGENTS.md`.
3. Inspect `git status`, the current migrations, nearby tests, and the actual implementation. Preserve unrelated work and adapt the brief when earlier tickets have changed the named entry points.
4. Implement one end-to-end slice: migration or configuration, server boundary, domain/store logic, UI state, and tests where the ticket reaches those layers. Keep route handlers narrow and server-only concerns outside client modules.
5. Preserve these invariants:
   - Resolve workspace identity on the server near every data operation; client identifiers never establish ownership.
   - Return non-enumerating responses for inaccessible resources.
   - Keep evidence metadata server-owned and historical messages renderable.
   - Make retries and concurrent mutations idempotent or transactional.
   - Keep credentials, document contents, prompts, evidence text, and personal data out of logs.
   - Use forward migrations that work on both a clean database and the previously deployed schema.
6. Run the focused tests while iterating, then the repository's complete test, typecheck, lint, and production-build scripts from `package.json`. Completion means every required check passes or the handoff names a reproducible external blocker.
7. Return a handoff containing the issue number, behavior delivered, migrations and configuration added, commands and results, deployment or credentialed checks performed, and any residual risk. Update the issue only with evidence actually observed.

## Dependency order

```text
#3 workspace ownership
|-- #4 guest conversation --> #5 guest lifecycle --+
|                       \--> #7 guest claim -------+--> #8 hardening --> #9 release
|-- #6 member accounts ----/
|-- #10 ingestion jobs --> #12 OCR
|                    \----> #14 document management
|                    \----> #15 production models
|-- #13 hybrid retrieval

#11 retrieval evaluation --> #13 hybrid retrieval
                         \--> #15 production models
```

The immediate frontier is #3 and #11. Re-check GitHub before relying on this diagram because issue dependencies may be revised.

## Brief index

- [#3 Workspace-scoped ownership](003-workspace-scoped-ownership.md)
- [#4 Temporary guest conversation](004-temporary-guest-conversation.md)
- [#5 Guest lifecycle](005-guest-lifecycle.md)
- [#6 Persistent member accounts](006-persistent-member-accounts.md)
- [#7 Claim a guest conversation](007-claim-guest-conversation.md)
- [#8 Privacy and abuse hardening](008-privacy-and-abuse-hardening.md)
- [#9 Authenticated-workspace release](009-authenticated-workspace-release.md)
- [#10 Durable ingestion jobs](010-durable-ingestion-jobs.md)
- [#11 Retrieval evaluation](011-retrieval-evaluation.md)
- [#12 Scanned-PDF OCR](012-scanned-pdf-ocr.md)
- [#13 Hybrid retrieval and reranking](013-hybrid-retrieval.md)
- [#14 Document deletion and re-indexing](014-document-management.md)
- [#15 Production AI models](015-production-ai-models.md)
