# Persistent member accounts

Grounded provides persistent member accounts while preserving the public guest experience.

## Authentication & Session Architecture

```text
Visitor
  ├── Guest Mode (default): browser-scoped session cookie (grounded_guest)
  │     └── 1 temporary conversation, 1-hour inactivity expiry
  │
  └── Member Mode (authenticated): signed session cookie (grounded_member)
        └── Stable workspace, multi-conversation history, persistent documents
```

## Security & Isolation Guarantees

- **Session Token**: Signed HMAC-SHA256 token carrying member ID, email, and workspace ID, protected by `MEMBER_AUTH_SECRET`.
- **Server-Side Authorization**: Every data route (`/api/chats`, `/api/chat`, `/api/documents`) calls `resolveWorkspace()` on the server. Client-provided workspace identifiers are never trusted.
- **Cache Protection**: All authenticated responses include `Cache-Control: private, no-store` headers to prevent intermediary and shared caching.
- **Sign Out**: `POST /api/auth/signout` immediately invalidates the member session cookie and returns the user to an isolated guest experience.
