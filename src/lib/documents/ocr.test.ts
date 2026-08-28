/**
 * document-chat
 * Copyright (C) 2026 Famanias
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
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
