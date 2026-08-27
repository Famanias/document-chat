# Ticket #4: Give signed-out visitors one temporary conversation

Issue: https://github.com/Famanias/document-chat/issues/4

Read [the shared protocol](README.md) first. Begin only after #3 is complete. The guest credential grants access to one temporary workspace; it is not a general anonymous account.

## Implementation sequence

1. Extend the workspace resolver with an opaque, high-entropy guest session carried by a secure, HTTP-only session cookie. Store only a verifier or digest server-side when a raw credential would create disclosure risk. Completion means no client-selected workspace ID participates in resolution.
2. Create or resume exactly one guest workspace and conversation per valid browser session. Handle missing, malformed, rotated, and expired credentials through the same fresh-guest path without revealing whether an old workspace exists.
3. Run the existing upload, streaming chat, reload, and evidence flows through the resolved guest workspace. Prove another browser session cannot list or access those resources.
4. Adapt the UI to a single-conversation guest mode: remove saved-history affordances and display a persistent, accessible "Temporary - sign in to save" notice without blocking use.
5. Add configurable baseline upload, message, and request limits at server boundaries. Return actionable limit states while keeping implementation compatible with the stronger shared limiter in #8.
6. Test session resume, new session isolation, invalid credentials, upload, streaming, evidence reload, hidden history, and quota failures.

## Design constraints

- Use a browser-session cookie without persistent expiry for the access credential; server retention is handled by #5.
- Keep guest identity resolution server-only and compatible with streaming Route Handlers.
- Create resources lazily where practical so a page view alone does not generate abandoned database rows.
- The UI may advertise sign-in, but account creation and claiming belong to #6 and #7.

## Required handoff evidence

Include cookie attributes, credential storage strategy, two-browser isolation results, quota configuration, screenshots or component-test evidence for guest UI states, and complete quality-gate output.
