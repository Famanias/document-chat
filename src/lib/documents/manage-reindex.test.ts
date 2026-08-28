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
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createIngestionJob: vi.fn(),
  getJobByDocumentId: vi.fn(),
  getRawSourceBytes: vi.fn(),
  retryJob: vi.fn(),
  processIngestionJob: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({ query: mocks.query }),
}));

vi.mock("@/lib/ingestion/store", () => ({
  createIngestionJob: mocks.createIngestionJob,
  getJobByDocumentId: mocks.getJobByDocumentId,
  getRawSourceBytes: mocks.getRawSourceBytes,
  retryJob: mocks.retryJob,
}));

vi.mock("@/lib/ingestion/worker", () => ({
  processIngestionJob: mocks.processIngestionJob,
}));

import { reindexDocument } from "@/lib/documents/manage";

const workspace = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  conversationId: "10000000-0000-4000-8000-000000000011",
} as const;

describe("failed document reindexing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([
      {
        id: "10000000-0000-4000-8000-000000000021",
        filename: "resume.pdf",
        mime_type: "application/pdf",
        size_bytes: 192_968,
        extracted_text: "",
      },
    ]);
    mocks.getJobByDocumentId.mockResolvedValue({ id: "job-1" });
    mocks.getRawSourceBytes.mockResolvedValue(Buffer.from("retained source"));
    mocks.retryJob.mockResolvedValue({ id: "job-1" });
    mocks.processIngestionJob.mockResolvedValue({ success: true });
  });

  it("retries the existing failed job so the original document can recover", async () => {
    await expect(
      reindexDocument(
        workspace,
        workspace.conversationId,
        "10000000-0000-4000-8000-000000000021",
      ),
    ).resolves.toEqual({ success: true, jobId: "job-1" });

    expect(mocks.retryJob).toHaveBeenCalledWith(workspace, "job-1");
    expect(mocks.processIngestionJob).toHaveBeenCalledWith("job-1");
    expect(mocks.createIngestionJob).not.toHaveBeenCalled();
  });

  it("returns the worker failure so the UI does not report a false recovery", async () => {
    mocks.processIngestionJob.mockResolvedValue({
      success: false,
      error: "Embedding provider unavailable.",
    });

    await expect(
      reindexDocument(
        workspace,
        workspace.conversationId,
        "10000000-0000-4000-8000-000000000021",
      ),
    ).resolves.toEqual({
      success: false,
      error: "Embedding provider unavailable.",
      jobId: "job-1",
    });
  });
});
