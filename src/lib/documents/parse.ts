import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import { AppError } from "@/lib/api-errors";
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
    if (content) {
      segments.push({ content, pageNumber: null, section });
    }
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

export async function parseDocument(
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
      const segments = pages
        .map((content, index) => ({
          content: content.trim(),
          pageNumber: index + 1,
          section: null,
        }))
        .filter((page) => page.content.length > 0);

      if (segments.length === 0) {
        throw new AppError(
          422,
          "No selectable text was found in this PDF. Scanned PDFs are not supported yet.",
        );
      }

      return {
        pageCount: pdf.numPages,
        segments,
        extractedText: pages
          .map((content, index) => `--- Page ${index + 1} ---\n${content.trim()}`)
          .join("\n\n"),
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
