# Ticket #11: Establish a retrieval evaluation baseline

Issue: https://github.com/Famanias/document-chat/issues/11

Read [the shared protocol](README.md) first. This ticket can start immediately and must measure the same retrieval boundary used by production rather than a parallel toy implementation.

## Implementation sequence

1. Define a compact case schema for fixture documents, question, expected supporting document and location, acceptable evidence chunks, and supported-versus-no-answer intent. Validate it at runtime so malformed cases fail clearly.
2. Add synthetic PDF, TXT, and Markdown fixtures covering the issue's retrieval behaviors. Keep facts unambiguous enough to score and include close distractors that expose semantic-only weaknesses.
3. Extract or adapt the production retrieval boundary so the runner can call it with controlled embeddings/data while the application continues through the same ranking logic. Avoid duplicating ranking code in the evaluator.
4. Implement deterministic metrics for retrieval recall, evidence correctness, and no-answer evidence selection. Keep model-generated answer judging in an explicit credentialed mode whose output records model identity and run configuration.
5. Record the current vector-only baseline in a comparable artifact. Separate structural CI checks from network-dependent evaluation so ordinary CI is stable.
6. Document commands, interpretation, case-authoring workflow, and the threshold/change process future tickets must follow.

## Design constraints

- Fixtures must be synthetic and safe to commit.
- Stable case IDs and machine-readable output allow comparison across branches and model changes.
- Do not use exact prose matching as the primary groundedness metric.
- A baseline records observed behavior; it should not be edited to make a later implementation appear better.

## Required handoff evidence

Include the case schema, fixture coverage table, runner boundary, metric definitions, baseline artifact, credential-free CI result, credentialed-run status, and complete quality-gate output.
