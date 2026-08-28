# OCR fallback for scanned and mixed PDFs

PDF document ingestion provides bounded OCR fallback for scanned and text-insufficient pages.

## Page Detection & Extraction Pipeline

```text
PDF Upload
  ├── 1. Extract native text per page via PDF parsing
  ├── 2. For each page:
  │        ├── If characters >= 30: Use authoritative native text
  │        └── If characters < 30: Trigger OCR adapter for that page
  ├── 3. Normalize OCR output (whitespace, control characters)
  └── 4. Feed page segments into chunking & embedding with original pageNumber
```

## Guarantees

- **No Unnecessary OCR**: Searchable PDFs with selectable text bypass OCR entirely, preventing latency and resource overhead.
- **Page-Level Authority**: Every generated chunk and evidence card retains its original 1-based `pageNumber`.
- **Mixed PDF Integrity**: Mixed documents (e.g. native text report with an embedded scanned form) combine native and OCR segments without duplicating pages.
