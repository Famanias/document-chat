# Ticket #12: Add OCR fallback for scanned PDFs

Issue: https://github.com/Famanias/document-chat/issues/12

Read [the shared protocol](README.md) first. Begin only after #10 is complete. OCR must be a bounded ingestion stage and retain page-level authority for evidence.

## Implementation sequence

1. Build representative searchable, image-only, mixed, blank, rotated, and failed PDF fixtures. Define a measurable per-page native-text threshold and verify it against the fixtures before integrating OCR.
2. Evaluate OCR options against the deployed worker runtime, page limit, language needs, privacy, latency, cost, and native-binary constraints. Prefer a deployable deterministic adapter; request an operator choice before adding a paid provider or credential.
3. Add page-level detection so native text remains authoritative where sufficient and OCR runs only for deficient pages. Normalize OCR output without merging or duplicating page content.
4. Feed OCR segments into the existing chunk/embed/store stages with original page numbers. Report bounded stage progress and classify timeout, resource, encrypted-document, and provider failures safely.
5. Enforce resource limits before expensive work and ensure retry/idempotency semantics come from the ingestion job rather than a second OCR-specific queue.
6. Test mixed extraction, exact page evidence, low-confidence/empty OCR, retry, cancellation or timeout, workspace isolation, and existing PDF behavior. Document supported languages and operational limits.

## Design constraints

- Preserve page boundaries from detection through evidence cards.
- Do not OCR pages that already have sufficient native text.
- Keep source files private and within #10 retention rules.
- Treat OCR text as untrusted document content under the existing prompt boundary.

## Required handoff evidence

Include the OCR decision record, detection threshold results, deployment compatibility, page-accuracy tests, timing/resource bounds, failure-state UI, cost or credential requirements, and complete quality-gate output.
