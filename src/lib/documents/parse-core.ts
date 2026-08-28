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
import { extractText, getDocumentProxy } from "unpdf";

import { AppError } from "@/lib/api-errors";
import { processPdfPages } from "@/lib/documents/ocr";
import type { ParsedDocument, SourceSegment } from "@/lib/documents/types";

const MAX_PDF_PAGES = 150;

function parseMarkdown(text: string): SourceSegment[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const headingStack: string[] = [];
  const segments: SourceSegment[] = [];
  let section = "Introduction";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) segments.push({ content, pageNumber: null, section });
    buffer = [];
  };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) {
      buffer.push(line);
      continue;
    }

    flush();
    const level = match[1].length;
    const title = match[2].replace(/\s+#+\s*$/, "").trim();
    headingStack.splice(level - 1);
    headingStack[level - 1] = title;
    section = headingStack.filter(Boolean).join(" › ");
    buffer.push(line);
  }

  flush();
  return segments;
}

function decodeText(buffer: ArrayBuffer) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (text.includes("\0")) throw new Error("Binary content detected");
    return text;
  } catch (error) {
    throw new AppError(
      422,
      "This text file is not valid UTF-8 and could not be read.",
      { cause: error },
    );
  }
}

export async function parseDocumentCore(
  extension: "pdf" | "txt" | "md",
  buffer: ArrayBuffer,
): Promise<ParsedDocument> {
  if (extension === "pdf") {
    const bytes = new Uint8Array(buffer);
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") {
      throw new AppError(415, "The selected file does not appear to be a valid PDF.");
    }

    try {
      const pdf = await getDocumentProxy(bytes);
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new AppError(
          413,
          `PDFs are limited to ${MAX_PDF_PAGES} pages for this demo.`,
        );
      }
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = text as string[];
      const { segments, extractedText } = await processPdfPages(pages);

      if (segments.length === 0) {
        throw new AppError(
          422,
          "No readable text was found in this PDF.",
        );
      }

      return {
        pageCount: pdf.numPages,
        segments,
        extractedText,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(422, "This PDF could not be parsed.", { cause: error });
    }
  }

  const extractedText = decodeText(buffer).trim();
  if (!extractedText) {
    throw new AppError(422, "The selected document is empty.");
  }

  const segments =
    extension === "md"
      ? parseMarkdown(extractedText)
      : [{ content: extractedText, pageNumber: null, section: null }];

  return { extractedText, pageCount: null, segments };
}
