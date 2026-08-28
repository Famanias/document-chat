import { describe, expect, it, vi } from "vitest";

import {
  isPageTextSufficient,
  normalizeOcrText,
  processPdfPages,
} from "@/lib/documents/ocr";

describe("OCR fallback & page-level processing", () => {
  it("determines page text sufficiency based on character count threshold", () => {
    expect(isPageTextSufficient("This page has plenty of searchable native text.")).toBe(true);
    expect(isPageTextSufficient("Short")).toBe(false);
    expect(isPageTextSufficient("")).toBe(false);
  });

  it("normalizes OCR text by stripping control characters and excessive whitespace", () => {
    const raw = "  Page content\x00 with  some   spaces\n\n\nand newlines.  ";
    expect(normalizeOcrText(raw)).toBe("Page content with some spaces\n\nand newlines.");
  });

  it("extracts searchable PDF without calling OCR adapter", async () => {
    const ocrAdapter = vi.fn();
    const pagesText = [
      "This is page one with enough characters to be considered fully native.",
      "This is page two with also enough characters to be considered fully native.",
    ];

    const result = await processPdfPages(pagesText, ocrAdapter);

    expect(ocrAdapter).not.toHaveBeenCalled();
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.pageNumber).toBe(1);
    expect(result.segments[1]?.pageNumber).toBe(2);
    expect(result.ocrPagesCount).toBe(0);
  });

  it("calls OCR adapter only for text-insufficient pages in mixed PDFs", async () => {
    const ocrAdapter = vi.fn().mockResolvedValue({
      text: "Scanned receipt with total $45.00",
      confidence: 0.95,
    });

    const pagesText = [
      "Page one has plenty of native text describing the financial breakdown of the project.",
      "", // Page 2 is scanned / image-only
    ];

    const result = await processPdfPages(pagesText, ocrAdapter);

    expect(ocrAdapter).toHaveBeenCalledTimes(1);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.pageNumber).toBe(1);
    expect(result.segments[0]?.content).toContain("financial breakdown");
    expect(result.segments[1]?.pageNumber).toBe(2);
    expect(result.segments[1]?.content).toContain("Scanned receipt");
    expect(result.ocrPagesCount).toBe(1);
  });
});
