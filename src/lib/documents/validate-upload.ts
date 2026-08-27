import { AppError } from "@/lib/api-errors";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENT_CHUNKS = 300;
const extensions = new Set(["pdf", "txt", "md"] as const);
export type SupportedExtension = "pdf" | "txt" | "md";

export function safeFilename(value: string) {
  return (value.split(/[\\/]/).pop() ?? "document")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 180);
}

export function extensionOf(filename: string): SupportedExtension | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension && extensions.has(extension as SupportedExtension)
    ? (extension as SupportedExtension)
    : null;
}

function validateMimeType(extension: SupportedExtension, mimeType: string) {
  if (!mimeType || mimeType === "application/octet-stream") return;
  const valid =
    extension === "pdf"
      ? mimeType === "application/pdf"
      : ["text/plain", "text/markdown", "text/x-markdown"].includes(mimeType);
  if (!valid) throw new AppError(415, "The file type does not match its extension.");
}

export function validateUpload(file: { name: string; size: number; type: string }) {
  if (file.size === 0) throw new AppError(400, "The selected document is empty.");
  if (file.size > MAX_FILE_BYTES) {
    throw new AppError(413, "Documents are limited to 4 MB for this demo.");
  }

  const filename = safeFilename(file.name);
  const extension = extensionOf(filename);
  if (!extension) throw new AppError(415, "Upload a PDF, TXT, or Markdown (.md) file.");
  validateMimeType(extension, file.type);
  return { filename, extension };
}

export function validateChunkCount(chunkCount: number) {
  if (chunkCount > MAX_DOCUMENT_CHUNKS) {
    throw new AppError(
      413,
      `This document contains more than ${MAX_DOCUMENT_CHUNKS} passages. Choose a shorter document for this demo.`,
    );
  }
}
