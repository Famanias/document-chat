# Guest conversation lifecycle

Guest conversations are temporary, browser-scoped workspaces with defined lifecycle boundaries, explicit session management, and automated physical deletion.

## Expiry & Inactivity Window

- **Inactivity Expiration**: 1 hour (`GUEST_INACTIVITY_LIMIT_MS = 3,600,000 ms`).
- **Activity Tracking**: Every successful operation (upload, question, chat load) updates `last_active_at` and extends `expires_at = now() + 1 hour`.
- **Clock Injection**: Time is resolved via an injectable `ClockFn` for deterministic lifecycle testing.
- **Session Lost**: If a visitor clears their cookie or closes a private window, access to the prior workspace is immediately unrecoverable.

## Transactional Lifecycle Operations

| Action | API Trigger | Behavior |
| --- | --- | --- |
| **New temporary conversation** | `DELETE /api/chats?action=reset` | Permanently deletes the current guest workspace (cascading all documents, chunks, messages, embeddings), issues a new session credential, and provisions a clean conversation. |
| **End temporary session** | `DELETE /api/chats?action=end` | Deletes the guest workspace and session immediately, clears the `grounded_guest` cookie, and returns the visitor to an initial state. |

## Scheduled Inactivity Cleanup

Expired guest sessions are physically cleaned up via the automated cron endpoint `POST /api/cron/cleanup`:

- **Authentication**: Protected by `CRON_SECRET` (`Authorization: Bearer <CRON_SECRET>` or `x-cron-secret` header).
- **Batch Bounding**: Deletes in configurable bounded batches (default 50 workspaces per invocation) using transactional subqueries.
- **Member Immunity**: Cleanup strictly targets `guest_sessions.expires_at <= now()`. Pre-auth and member workspaces are never selected or deleted.
- **Telemetry**: Returns execution metadata (`cleanedCount`, `durationMs`) without logging sensitive contents or credentials.
