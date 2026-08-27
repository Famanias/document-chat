import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/api-errors";
import { MAX_FILE_BYTES, validateUpload } from "@/lib/documents/validate-upload";

describe("validateUpload", () => {
  it.each([
    ["brief.pdf", "application/pdf", "pdf"],
    ["notes.txt", "text/plain", "txt"],
    ["guide.md", "text/markdown", "md"],
  ])("accepts %s", (name, type, extension) => {
    expect(validateUpload({ name, type, size: 512 })).toEqual({ filename: name, extension });
  });

  it("rejects unsupported files with a user-safe error", () => {
    expect(() => validateUpload({ name: "sheet.csv", type: "text/csv", size: 10 })).toThrow(AppError);
    expect(() => validateUpload({ name: "sheet.csv", type: "text/csv", size: 10 })).toThrow(
      "Upload a PDF, TXT, or Markdown (.md) file.",
    );
  });

  it("rejects files over the serverless upload limit", () => {
    expect(() => validateUpload({ name: "large.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 })).toThrow(
      "Documents are limited to 4 MB",
    );
  });
});
