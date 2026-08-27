# Ticket #13: Add hybrid retrieval and reranking

Issue: https://github.com/Famanias/document-chat/issues/13

Read [the shared protocol](README.md) first. Begin only after #3 and #11 are complete. The evaluation baseline decides whether added complexity earns its place.

## Implementation sequence

1. Run and preserve the #11 vector-only baseline. Inspect missed cases and define the smallest lexical, fusion, and reranking changes that target observed failures.
2. Add workspace-scoped PostgreSQL lexical retrieval with suitable generated data or indexes. Verify query plans on representative data and keep only ready documents attached to the current conversation eligible.
3. Fuse bounded lexical and vector candidate lists using a deterministic strategy such as reciprocal-rank fusion. Keep stable tie-breaking and expose configuration needed to reproduce a result.
4. Add a bounded reranker behind a narrow interface. Preserve the server-owned mapping from candidate IDs to filename, location, content, and excerpt; the reranker may order or score known candidates but cannot manufacture metadata.
5. Implement vector-only rollback and predictable behavior for empty results, low confidence, upstream failure, and lexical/vector disagreement.
6. Compare quality, no-answer behavior, latency, and provider usage against the baseline. Add isolation, ranking, fallback, metadata-integrity, and query-plan tests before updating retrieval documentation.

## Design constraints

- Apply workspace and chat-document filters inside both candidate queries.
- Bound candidate counts before reranking to control latency and cost.
- Keep request-local evidence IDs and stored evidence-card semantics unchanged.
- Ship the hybrid path only if the recorded evaluation has no evidence-correctness or no-answer regression; otherwise hand back the measured blocker.

## Required handoff evidence

Include schema/index changes, query plans, fusion formula, reranker contract, before/after evaluation report, latency/provider deltas, rollback proof, and complete quality-gate output.
