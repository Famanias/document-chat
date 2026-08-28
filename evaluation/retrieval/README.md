# Retrieval evaluation

This directory contains the versioned, synthetic retrieval baseline used before changing retrieval strategies or production models. Ordinary CI needs no database, network access, or model credential.

## Commands

```bash
# Validate fixtures and reproduce the committed controlled-vector baseline.
npm run eval:retrieval:check

# Print a fresh controlled-vector report without changing the baseline.
npm run eval:retrieval

# Use the production OpenRouter embedding model, generate answers, and run the semantic judge.
OPENROUTER_API_KEY=... npm run eval:retrieval:credentialed

# Persist an explicit run artifact. Files under runs/ are intentionally ignored.
npx tsx scripts/retrieval-eval.ts --credentialed --output evaluation/retrieval/runs/my-run.json
```

The credentialed command loads root `.env*` files through `@next/env`. It records the requested embedding, answer, and judge models; each case also records the actual answer and judge model IDs returned by OpenRouter. `OPENROUTER_CHAT_MODEL`, `OPENROUTER_EMBEDDING_MODEL`, and `OPENROUTER_JUDGE_MODEL` can pin those identities. The committed baseline does not claim a credentialed run: it has `answerCorrectness: null` and uses the controlled-vector configuration shown in its artifact.

## Dataset schema

[`dataset.json`](./dataset.json) is validated at runtime by `src/evaluation/retrieval/schema.ts`. Unknown fields, malformed vectors, duplicate IDs, broken document references, contradictory intent, fixture path escapes, extension mismatches, changed fixture hashes, missing source locations, and invalid chunk references all fail with a case/document-specific message.

Each document declares a stable ID, safe fixture path, format, SHA-256 digest, and one controlled vector per production chunk. Each case declares:

- a stable ID and covered behavior tags;
- the question and `supported` or `no-answer` intent;
- semantic facts for the optional model judge;
- expected document and page, Markdown section, or passage location;
- acceptable evidence chunk groups (each group can contain alternative chunk indexes);
- a deterministic controlled query vector.

The loader runs PDF, TXT, and Markdown files through the same parser core and chunker used during ingestion. Controlled vectors deliberately replace only the credentialed embedding call.

## Fixture coverage

| Stable case | Format/location | Behavior | Expected support |
| --- | --- | --- | --- |
| `exact-fact-txt-survey-time` | TXT passage 0 | Exact fact | `cormorant-survey` |
| `exact-fact-pdf-activation` | PDF page 1 | Exact fact plus close service-tag distractor | `aurora-field-manual` |
| `multi-page-pdf-activation-and-voltage` | PDF pages 1 and 2 | Multi-page evidence | `aurora-field-manual` |
| `markdown-section-water-cycle` | Markdown `Water Reclamation` | Section location plus competing schedule | `meridian-habitat` |
| `competing-document-service-tag` | Markdown introduction | Competing LANTERN codes | `meridian-habitat` |
| `markdown-section-backup-phrase` | Markdown `Communications` | Exact section fact | `meridian-habitat` |
| `unsupported-antenna-warranty` | No location | Unsupported answer | none |

All fixture facts and names are invented. The PDF can be reproduced with `python scripts/generate-retrieval-fixture.py`; ReportLab's invariant mode keeps its bytes stable.

## Production boundary and metrics

Production uses pgvector to preselect at most 24 candidates. Both the application and evaluator then call `rankEvidenceCandidates` in `src/lib/ai/retrieval-ranking.ts`, which computes cosine similarity, preserves stable input order for ties, returns the top six, creates excerpts, and assigns final `E1`-`E6` IDs. The evaluator does not contain a second ranking implementation.

Metrics are deterministic calculations over stable chunk IDs, not prose matching:

- **Retrieval recall**: acceptable evidence groups represented anywhere in top six divided by all required groups across supported cases. A multi-page case contributes one requirement per page/chunk group.
- **Evidence correctness**: selected acceptable chunks divided by selected chunks across supported cases. Selecting no evidence for a supported case contributes `0/1` so silence cannot look perfect.
- **No-answer evidence selection**: unsupported cases with zero selected evidence divided by all unsupported cases.
- **Answer correctness**: credentialed only. A structured semantic judge checks criteria coverage, grounding in selected evidence, and expected decline behavior; it never uses exact answer-prose equality.

The controlled run uses a recorded similarity threshold only as a deterministic evidence-selection proxy. Product answers continue to select server-validated evidence through the model tool. Credentialed evaluation measures that model-dependent behavior separately.

## Baseline interpretation

[`baselines/vector-only-v1.json`](./baselines/vector-only-v1.json) records dataset version 1 with top-6 cosine retrieval and the controlled threshold selector:

| Metric | Baseline |
| --- | ---: |
| Retrieval recall | `7/7` (`1.0000`) |
| Evidence correctness | `7/9` (`0.7778`) |
| No-answer evidence selection | `1/1` (`1.0000`) |
| Answer correctness | not run (credentialed only) |

The imperfect evidence score is intentional observed behavior: two close Meridian distractor chunks cross the controlled selection threshold. Do not change vectors, expectations, or the baseline to make a later strategy appear better.

## Adding or changing cases

1. Add only synthetic material under `fixtures/`. Regenerate the PDF through its script when appropriate.
2. Add the document digest and one controlled vector per chunk to `dataset.json`, or append a case using existing documents. Keep published IDs stable.
3. Declare semantic facts, source locations, and acceptable chunk groups. Do not add runner branches for individual cases.
4. Run focused tests and `npm run eval:retrieval`. Inspect rankings and metric denominators.
5. Run `npm run eval:retrieval:check`. A dataset or behavior change must fail against the old baseline until the review process below is completed.

Changing the dataset, controlled threshold, top-K, ranking algorithm, metric definition, or model configuration is a versioned evaluation change. Increment the dataset/artifact version as applicable, preserve the old baseline, write a new baseline filename, compare both reports in review, explain every metric movement, and only then update the CI default in the same change. Regression fixes add a case first; thresholds are not lowered merely to pass it.
