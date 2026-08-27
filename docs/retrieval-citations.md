# Retrieval and Citation Strategy

## Document Parsing and Metadata Preservation

- **PDFs**: Extracted using `unpdf` with `mergePages: false`. Each page is maintained as a discrete source segment so chunking never bleeds across page boundaries. Each chunk retains its 1-indexed `pageNumber`.
- **Markdown**: Parsed with an ATX heading tracker (`#` through `######`). Chunks carry their hierarchical heading path (e.g., `Settings › Authentication`) as their `section` property.
- **Plain Text**: Retains filename and passage index without artificial page numbers.

## Chunking

- Target size: 1,000 characters (~250 tokens).
- Overlap: 150 characters (~40 tokens).
- Split points prefer natural boundaries (paragraphs `\n\n`, sentences `. `, single newlines `\n`, spaces ` `).
- Scoped to individual source segments (pages/sections) so metadata is never diluted.

## Embedding and Vector Search

- Embedding model: `liquid/lfm-2.5-embedding-350m:free` via OpenRouter (1,024 dimensions).
- Batch size: 32 chunks per API call during ingestion.
- Retrieval query: Embeds user question and executes a cosine distance search using pgvector:
  ```sql
  SELECT chunks.*, 1 - (chunks.embedding <=> $1::vector) AS similarity
  FROM document_chunks chunks
  INNER JOIN chat_documents cd ON cd.document_id = chunks.document_id
  WHERE cd.chat_id = $2
  ORDER BY chunks.embedding <=> $1::vector
  LIMIT 6;
  ```

## Citation Architecture

1. Retrieved chunks are labeled `E1` through `E6` in server memory.
2. In step 1 of response generation, the AI is constrained via tool choice to call `showEvidence` with an array of chosen `evidenceIds`.
3. The server validates selected IDs against the actual retrieval set and outputs structured evidence objects containing:
   - `filename`
   - `pageNumber` or `section`
   - `excerpt`
   - raw `similarity` for server-side retrieval diagnostics
4. In step 2, the AI streams its text answer without writing markdown brackets or hallucinated citation markers.
5. In the UI, the answer is rendered cleanly alongside expandable `<details>` evidence cards displaying the exact excerpt and citation metadata. Raw cosine similarity is intentionally not displayed as a percentage because it is a ranking signal, not calibrated answer confidence.
