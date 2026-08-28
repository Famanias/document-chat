# Temporary guest conversation

Signed-out visitors receive one temporary workspace containing one conversation. The browser never chooses the workspace: every public Route Handler resolves the guest cookie on the server, verifies the mapped conversation, and passes that `WorkspaceContext` into the existing workspace-scoped stores.

## Credential boundary

- Cookie name: `grounded_guest`
- Credential: 32 random bytes encoded as 43 base64url characters (256 bits)
- Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, high priority, and `Secure` in production
- Lifetime: browser-session cookie; no `Expires` or `Max-Age`
- Database storage: lowercase SHA-256 digest only; the raw credential is never persisted

`guest_sessions` uniquely maps one credential digest to one workspace and one chat. Its composite `(workspace_id, chat_id)` foreign key prevents a session from mapping to a chat in another workspace. Missing, malformed, and unknown credentials all take the same fresh-session path and receive a newly generated credential without exposing whether the presented value ever existed.

The initial `GET /api/chats` request creates the mapping transactionally when needed and sets the cookie before returning. All later upload, chat, streaming, reload, and evidence operations resolve the same mapping. `GET /api/chats` exposes only the mapped chat, and there is no public create-chat endpoint or guest history list.

## Baseline limits

| Variable | Default | Boundary |
| --- | ---: | --- |
| `GUEST_MAX_UPLOAD_BYTES` | `4194304` | Checked in the browser for feedback and again before server parsing/embedding |
| `GUEST_MAX_MESSAGE_CHARACTERS` | `12000` | Checked by the composer and strict server request validation |
| `GUEST_REQUESTS_PER_MINUTE` | `60` | Fixed one-minute in-process window per resolved guest workspace across public APIs |

Quota responses use bounded, actionable messages. Request-rate failures return `429` with `Retry-After`; upload and question limits return `413`. The in-process limiter is intentionally a baseline seam for the shared multi-instance hardening planned in ticket #8.

Guest expiry/retention, member accounts, claim-on-sign-in, and shared abuse infrastructure remain out of scope for this slice and belong to tickets #5–#8.
