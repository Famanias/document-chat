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
import {
  DEFAULT_GUEST_MAX_UPLOAD_BYTES,
  guestLimits,
} from "@/lib/guest/limits";

export const MAX_FILE_BYTES = DEFAULT_GUEST_MAX_UPLOAD_BYTES;
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

function fileLimitLabel(maxFileBytes: number) {
  if (maxFileBytes < 1024 * 1024) return `${Math.ceil(maxFileBytes / 1024)} KB`;
  const maxMegabytes = maxFileBytes / (1024 * 1024);
  return `${Number.isInteger(maxMegabytes) ? maxMegabytes : maxMegabytes.toFixed(1)} MB`;
}

export function validateUpload(file: { name: string; size: number; type: string }) {
  const maxFileBytes = guestLimits().maxUploadBytes;
  if (file.size === 0) throw new AppError(400, "The selected document is empty.");
  if (file.size > maxFileBytes) {
    throw new AppError(
      413,
      `Temporary uploads are limited to ${fileLimitLabel(maxFileBytes)}. Choose a smaller document.`,
    );
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
