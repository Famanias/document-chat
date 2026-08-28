# Production AI model governance and observability

Grounded requires explicit, pinned AI models in production with telemetry that protects user privacy.

## Pinned Model Defaults

| Operation | Default Production Model | Dimensions / Details |
| --- | --- | --- |
| **Chat & Grounding** | `google/gemini-2.5-flash` | High accuracy, low latency grounding model |
| **Embeddings** | `baai/bge-m3` | 1,024-dimensional dense vector embeddings |

## Validation & Guardrails

- In `NODE_ENV === "production"`, configuration strictly rejects free-tier `:free` identifiers to prevent rate-limit degradation or silent provider changes.
- Embedding vector spaces must match 1,024 dimensions. Changing embedding models requires triggering re-indexing via the durable ingestion workflow.

## Privacy-Preserving Telemetry

- `recordModelTelemetry()` tracks model name, latency, outcome, token counts, and retry attempts.
- Telemetry strictly omits user prompts, raw chunk contents, synthesized answers, and credentials.
