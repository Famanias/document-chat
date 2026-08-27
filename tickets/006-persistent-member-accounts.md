# Ticket #6: Add persistent member accounts

Issue: https://github.com/Famanias/document-chat/issues/6

Read [the shared protocol](README.md) first. Begin only after #3 is complete. Use current official Neon Auth documentation for the installed integration path; authentication APIs and setup details are time-sensitive.

## Implementation sequence

1. Verify Neon Auth's current Next.js App Router integration, environment requirements, session model, and preview-domain setup against primary documentation. Record the chosen server/client boundary before implementation.
2. Add email sign-up, sign-in, refresh, and sign-out while preserving the signed-out guest entry path. Keep provider secrets and privileged session verification in server-only modules.
3. Map the verified provider subject to one stable member workspace with a database uniqueness guarantee. Make first-login creation concurrency-safe and avoid storing unnecessary profile data.
4. Resolve member sessions close to each workspace-scoped read or mutation. Ensure history, chats, documents, messages, uploads, retrieval, and evidence stay inside the member workspace.
5. On sign-out, clear member state and establish a fresh guest experience without exposing cached member data. Mark personalized responses private and non-cacheable.
6. Test two members, refresh/reload, a second browser or device, sign-out, expired and forged sessions, safe provider failures, and cross-member identifiers.
7. Document local and preview configuration without writing credential values to the repository.

## Design constraints

- Provider identity proves who the member is; the database mapping determines which workspace they own.
- Use the provider's supported session primitives instead of implementing password storage or custom refresh tokens.
- Keep account creation separate from guest conversation claiming, which belongs to #7.
- If Neon Auth requires a dashboard action or unavailable credential, complete all local work and report the exact external step rather than fabricating verification.

## Required handoff evidence

Include primary documentation consulted, auth-to-workspace mapping, cookie/cache behavior, two-member isolation results, preview verification status, environment-variable names, and complete quality-gate output.
