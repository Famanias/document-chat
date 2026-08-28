# Ticket #9: Verify and release authenticated and guest workspaces

Issue: https://github.com/Famanias/document-chat/issues/9

Read [the shared protocol](README.md) first. Begin only after #5, #7, and #8 are complete. This is a release gate: fix defects found in scope, but keep unrelated enhancements out of the release.

## Verification sequence

1. Create an isolated preview environment with a clean Neon database and preview-scoped Neon Auth configuration. Inventory required variables and scheduled jobs without copying their values into files or logs.
2. Run migrations from empty state and from a snapshot of the previously deployed schema. Inspect constraints and row ownership after each path.
3. Execute the full issue matrix with one guest and two members. Capture response status, visible behavior, ownership queries, reload results, and cleanup outcomes for every case.
4. Inspect source, browser output, server logs, deployment logs, and telemetry for secrets, guest credentials, document contents, or personal data. Resolve every disclosure before release.
5. Run repository checks, CI, dependency/security scanning, and the production build. Record tool versions and exact results.
6. Update deployment, database, architecture, retention, quotas, deletion, cleanup, and environment documentation to match observed behavior.
7. Deploy only after all gates pass, then run the bounded production smoke matrix and verify zero shared-conversation visibility. If required access is unavailable, stop at the external gate and provide exact operator steps and remaining checks.

## Release constraints

- Use synthetic documents and test identities in preview and production smoke tests.
- Treat any cross-workspace visibility, stale member data after sign-out, or failed physical guest cleanup as a release blocker.
- Keep a rollback plan for both application deployment and forward-only database changes.
- Report observed results; never mark credentialed or production checks complete from local inference.

## Required handoff evidence

Include the completed matrix, migration paths, sanitized deployment identifiers, security-scan results, documentation changes, rollback plan, production smoke results or exact access blocker, and complete quality-gate output.
