# Hybrid retrieval and reranking

Evidence retrieval uses hybrid search combining pgvector semantic search and PostgreSQL full-text search fused with Reciprocal Rank Fusion (RRF).

## Retrieval Architecture

```text
Query
  ├── 1. Vector Search: Embed query -> pgvector cosine distance (<=>)
  └── 2. Lexical Search: plainto_tsquery('english') -> GIN content_tsv index
           │
           ▼
Reciprocal Rank Fusion (RRF)
  RRF(c) = (w_vector / (60 + r_vector)) + (w_lexical / (60 + r_lexical))
           │
           ▼
Server-Owned Evidence Metadata (E1, E2, ...)
  - Stable IDs, filename, page, section, chunkIndex, excerpt
  - Bounded candidate set (top 6 evidence items)
```

## Rollback & Configuration

| Environment Variable | Allowed Values | Default | Description |
| --- | --- | --- | --- |
| `RETRIEVAL_MODE` | `hybrid`, `vector`, `lexical` | `hybrid` | Controls the retrieval pipeline. Setting to `vector` immediately rolls back to vector-only search without database migration rollbacks. |

## Fallback Semantics

- If lexical full-text search yields zero matches or fails on special characters, the pipeline automatically falls back to vector search.
- Vector distance search provides graceful degradation for conceptual queries while lexical search boosts exact keyword and entity recall.
- Server-owned evidence mapping guarantees that model tool calling references only genuine retrieved database rows.
