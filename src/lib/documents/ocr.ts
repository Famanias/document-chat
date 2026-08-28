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
import { AppError } from "@/lib/api-errors";
import type { SourceSegment } from "@/lib/documents/types";

export const MIN_NATIVE_PAGE_CHARACTERS = 30;

export type OcrPageResult = {
  text: string;
  confidence: number;
};

export type OcrAdapter = (
  pageIndex: number,
  pageBytes: Uint8Array,
) => Promise<OcrPageResult>;

/**
 * Default lightweight OCR text normalizer
 */
export function normalizeOcrText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Evaluates whether a page has sufficient native selectable text
 */
export function isPageTextSufficient(pageText: string): boolean {
  const stripped = pageText.replace(/\s+/g, "").trim();
  return stripped.length >= MIN_NATIVE_PAGE_CHARACTERS;
}

/**
 * Combines native text extraction and OCR fallback per page
 */
export async function processPdfPages(
  pagesText: string[],
  ocrAdapter?: OcrAdapter,
): Promise<{ segments: SourceSegment[]; extractedText: string; ocrPagesCount: number }> {
  const segments: SourceSegment[] = [];
  const fullTextParts: string[] = [];
  let ocrPagesCount = 0;

  for (let index = 0; index < pagesText.length; index += 1) {
    const pageNumber = index + 1;
    const nativeText = pagesText[index]?.trim() ?? "";

    if (isPageTextSufficient(nativeText)) {
      // Authoritative native text
      segments.push({
        content: nativeText,
        pageNumber,
        section: null,
      });
      fullTextParts.push(`--- Page ${pageNumber} ---\n${nativeText}`);
    } else if (ocrAdapter) {
      // Run OCR fallback for text-insufficient page
      try {
        const ocrResult = await ocrAdapter(index, new Uint8Array());
        const normalized = normalizeOcrText(ocrResult.text);
        if (normalized.length > 0) {
          segments.push({
            content: normalized,
            pageNumber,
            section: null,
          });
          fullTextParts.push(`--- Page ${pageNumber} (OCR) ---\n${normalized}`);
          ocrPagesCount += 1;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Bounded fallback: continue to other pages
      }
    } else if (nativeText.length > 0) {
      // Use sparse native text if no OCR adapter provided
      segments.push({
        content: nativeText,
        pageNumber,
        section: null,
      });
      fullTextParts.push(`--- Page ${pageNumber} ---\n${nativeText}`);
    }
  }

  return {
    segments,
    extractedText: fullTextParts.join("\n\n"),
    ocrPagesCount,
  };
}
