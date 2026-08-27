import { describe, expect, it } from "vitest";

import { parseDocument } from "@/lib/documents/parse";

function textBuffer(text: string) {
  return new TextEncoder().encode(text).buffer;
}

function onePagePdf(text: string) {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += object;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return textBuffer(pdf);
}

describe("parseDocument", () => {
  it("extracts TXT content", async () => {
    const result = await parseDocument("txt", textBuffer("A plain text fact."));
    expect(result.extractedText).toBe("A plain text fact.");
    expect(result.segments[0]).toMatchObject({ pageNumber: null, section: null });
  });

  it("preserves Markdown heading paths", async () => {
    const result = await parseDocument(
      "md",
      textBuffer("# Product\nOverview text.\n\n## Limits\nMaximum size is 4 MB."),
    );
    expect(result.segments.map((segment) => segment.section)).toEqual([
      "Product",
      "Product › Limits",
    ]);
    expect(result.segments[1].content).toContain("Maximum size is 4 MB.");
  });

  it("extracts PDF text without losing the page number", async () => {
    const result = await parseDocument("pdf", onePagePdf("Quarterly reviews are required."));
    expect(result.pageCount).toBe(1);
    expect(result.segments[0].pageNumber).toBe(1);
    expect(result.segments[0].content).toContain("Quarterly reviews are required.");
  });
});
