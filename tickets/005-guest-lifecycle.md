# Ticket #5: Complete the guest conversation lifecycle

Issue: https://github.com/Famanias/document-chat/issues/5

Read [the shared protocol](README.md) first. Begin only after #4 is complete. Browser-session loss makes data inaccessible immediately; the retention job provides eventual physical deletion.

## Implementation sequence

1. Add explicit guest lifecycle timestamps and model one-hour inactivity expiry with an injectable clock. Update activity close to successful guest operations without letting stale requests revive an already expired workspace.
2. Implement "New temporary conversation" and "End temporary session" as transactional lifecycle operations. Invalidate the credential and cascade all owned data before returning a fresh state.
3. Build an idempotent, bounded cleanup operation that selects expired guest workspaces safely under concurrency. Authenticate the scheduler entry point and emit metadata-only failure telemetry.
4. Configure the deployment scheduler using the repository's deployment model. Document local invocation, authentication, batch bounds, retry behavior, and how operators confirm cleanup health.
5. Test replacement, explicit ending, inactivity extension, exact expiry boundaries, repeated cleanup, concurrent cleanup/activity, partial failure recovery, and member-workspace immunity.

## Design constraints

- Use database time or one consistently injected time source for expiry decisions.
- Lock or condition deletion so activity and cleanup cannot race into accidental loss of an active workspace.
- Cleanup logs may contain workspace/job identifiers and counts, but no credentials or document/message content.
- Physical deletion must follow existing foreign-key cascades rather than accumulating orphaned rows.

## Required handoff evidence

Include lifecycle state transitions, scheduler authentication, deterministic clock tests, concurrent cleanup results, database counts before and after deletion, deployment configuration, and complete quality-gate output.
