# Workspace Ownership

Every persisted chat graph belongs to one workspace. HTTP clients never choose a workspace: each Route Handler calls the server-only `resolveWorkspace()` adapter, then passes the resulting `WorkspaceContext` to every store and retrieval operation.

The current adapter returns the seeded pre-authentication demo workspace (`00000000-0000-4000-8000-000000000001`). This preserves the existing shared demo while leaving one narrow identity seam for the guest and member account tickets.

## Resolved-workspace call paths

| Route | Client-supplied identifiers | Server call path |
| --- | --- | --- |
| `GET /api/chats` | Optional `id` query parameter | `resolveWorkspace` -> `listChats(workspace)` or `loadChat(workspace, id)` |
| `POST /api/chats` | None | `resolveWorkspace` -> `createChat(workspace)` |
| `POST /api/documents` | `chatId` form field | `resolveWorkspace` -> `chatExists(workspace, chatId)` -> parse/embed -> `storeDocument(workspace, input)` |
| `POST /api/chat` | Chat `id` and message `id` in the validated JSON body | `resolveWorkspace` -> `loadChat(workspace, id)` -> `hasReadyDocuments(workspace, id)` -> `saveMessage(workspace, ...)` -> `retrieveEvidence(workspace, ...)` -> `saveMessage(workspace, ...)` on completed output |

A well-formed chat ID that is absent or owned by another workspace follows the same `404` path. Upload parsing and embeddings do not start until the workspace-scoped chat existence query succeeds.

Evidence IDs selected by the model are request-local labels rather than ownership inputs. The evidence tool can only resolve labels from the already workspace-scoped retrieval result and continues to construct citation metadata on the server.

## SQL inventory

| Module/function | Workspace enforcement in SQL |
| --- | --- |
| `chat/store.createChat` | Inserts only by selecting the resolved row from `workspaces` |
| `chat/store.listChats` | Filters `chats.workspace_id`; aggregate joins match both workspace and parent ID |
| `chat/store.loadChat` | Chat, message, document-link, and chunk queries all filter or join on workspace plus parent ID |
| `chat/store.chatExists` | Looks up the `(workspace_id, chat_id)` pair |
| `chat/store.saveMessage` | Inserts from an owned chat; conflict updates require the same workspace, chat, and role; chat timestamp/title updates include workspace |
| `chat/store.hasReadyDocuments` | Filters the link by workspace and joins the document on workspace plus ID |
| `documents/store.storeDocument` | Rechecks chat ownership, writes workspace on the document/link/chunks, and scopes the chat update inside one transaction |
| `ai/retrieve.retrieveEvidence` | Filters by workspace and joins chunks, documents, and chat links on workspace plus IDs |
| `workspaces/store.deleteWorkspace` | Deletes exactly the resolved workspace; database cascades remove its owned graph atomically |

The migration SQL is the only code that intentionally scans rows without a runtime workspace context. It backfills legacy data into the pre-auth workspace before making ownership columns non-null.

## Database integrity

`chats` and `documents` reference `workspaces` with `ON DELETE CASCADE` and expose unique `(workspace_id, id)` keys. `messages`, `document_chunks`, and both sides of `chat_documents` use composite foreign keys containing `workspace_id`. As a result, a child or join row cannot name a parent from a different workspace even if application validation is bypassed.

Migration tests run the real PostgreSQL schema in PGlite with pgvector. They cover a clean install, an upgrade containing rows from the pre-ownership schema, migration reapplication, guessed IDs, rejected cross-workspace chat-document/message/chunk writes, and deletion of one complete workspace graph while a second graph remains intact.
