# Zero-budget AI model governance and observability

Grounded is operated as a zero-budget application. Production and development therefore share free OpenRouter defaults, with telemetry that protects user privacy.

## Free Model Defaults

| Operation | Default Production Model | Dimensions / Details |
| --- | --- | --- |
| **Chat & Grounding** | `openrouter/free` | Routes each request to an available free chat model |
| **Embeddings** | `liquid/lfm-2.5-embedding-350m:free` | 1,024-dimensional dense vector embeddings |

## Validation & Guardrails

- Free models are accepted in production by design. Availability, selected chat model, and rate limits may vary with OpenRouter's free capacity.
- Environment overrides remain available, but the checked-in defaults must always be usable with an account that has no purchased credits.
- Embedding vector spaces must match 1,024 dimensions. Changing embedding models requires triggering re-indexing via the durable ingestion workflow.

## Privacy-Preserving Telemetry

- `recordModelTelemetry()` tracks model name, latency, outcome, token counts, and retry attempts.
- Telemetry strictly omits user prompts, raw chunk contents, synthesized answers, and credentials.
