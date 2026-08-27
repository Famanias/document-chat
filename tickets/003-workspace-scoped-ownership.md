# Ticket #3: Introduce workspace-scoped ownership

Issue: https://github.com/Famanias/document-chat/issues/3

Read [the shared protocol](README.md) first. This ticket creates an ownership seam, not the guest or member product experience delivered by later tickets.

## Implementation sequence

1. Inventory every path that reads or mutates chats, messages, documents, chunks, chat-document links, and evidence. Include `src/app/api`, `src/lib/chat`, `src/lib/documents`, and `src/lib/ai`. Completion means the inventory accounts for every SQL statement and every client-supplied identifier.
2. Design a forward migration for workspaces and workspace ownership. Enforce cross-workspace integrity in PostgreSQL, including the `chat_documents` relationship; application checks alone are insufficient. Define a safe upgrade path for existing rows and verify the migration on both the current schema and an empty database.
3. Introduce one server-only workspace context/resolver and thread it through stores and retrieval. Keep the temporary pre-authentication adapter narrow so #4 and #6 can replace it without rewriting persistence.
4. Scope listing, loading, creation, uploads, readiness checks, message writes, and retrieval in the SQL query itself. A lookup from another workspace must be indistinguishable from a missing record.
5. Add transactional workspace deletion and two-workspace isolation tests. Prove that guessed chat and document IDs cannot cross the boundary and that deletion affects only the selected workspace.
6. Update architecture and database documentation with the ownership model and migration behavior.

## Design constraints

- Prefer database constraints that make an invalid cross-workspace link unrepresentable.
- Do not derive workspace identity from a request-body or query-string workspace ID.
- Preserve the existing visible demo flow until #4 and #6 add real identity types.
- Keep workspace resolution separate from Neon Auth so guest and member identities share the same downstream store interface.

## Required handoff evidence

Include the ownership schema, the resolved-workspace call path for every route, clean and upgrade migration results, cross-workspace attack cases, cascade-deletion results, and the complete quality-gate output.
