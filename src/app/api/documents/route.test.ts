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
import { beforeEach, describe, expect, it, vi } from "vitest";

const workspace = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  conversationId: "10000000-0000-4000-8000-000000000011",
} as const;
const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  chatExists: vi.fn(),
  createIngestionJob: vi.fn(),
  getJob: vi.fn(),
  processIngestionJob: vi.fn(),
  enforceGuestRequestLimit: vi.fn(),
}));

vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@/lib/chat/store", () => ({
  chatExists: mocks.chatExists,
}));

vi.mock("@/lib/ingestion/store", () => ({
  createIngestionJob: mocks.createIngestionJob,
  getJob: mocks.getJob,
}));

vi.mock("@/lib/ingestion/worker", () => ({
  processIngestionJob: mocks.processIngestionJob,
}));

vi.mock("@/lib/guest/limits", () => ({
  enforceGuestRequestLimit: mocks.enforceGuestRequestLimit,
  guestLimits: () => ({
    maxUploadBytes: 4 * 1024 * 1024,
    maxMessageCharacters: 12_000,
    requestsPerMinute: 60,
  }),
  DEFAULT_GUEST_MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
}));

import { POST } from "@/app/api/documents/route";

describe("documents route workspace isolation & durable ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue(workspace);
  });

  it("rejects another workspace's chat before enqueuing or processing", async () => {
    const guessedId = "20000000-0000-4000-8000-000000000012";
    const formData = new FormData();
    formData.set("chatId", guessedId);
    formData.set("file", new File(["private"], "private.txt", { type: "text/plain" }));
    mocks.chatExists.mockResolvedValue(false);

    const response = await POST({ formData: async () => formData } as Request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "That conversation no longer exists.",
    });
    expect(mocks.createIngestionJob).not.toHaveBeenCalled();
    expect(mocks.processIngestionJob).not.toHaveBeenCalled();
  });

  it("creates durable ingestion job and processes document", async () => {
    const formData = new FormData();
    const file = new File(["grounded facts"], "facts.txt", { type: "text/plain" });
    formData.set("chatId", workspace.conversationId);
    formData.set("file", file);
    mocks.chatExists.mockResolvedValue(true);
    mocks.createIngestionJob.mockResolvedValue({
      id: "job-1",
      documentId: "doc-1",
      filename: "facts.txt",
      status: "queued",
    });
    mocks.processIngestionJob.mockResolvedValue({ success: true });
    mocks.getJob.mockResolvedValue({
      id: "job-1",
      documentId: "doc-1",
      filename: "facts.txt",
      status: "ready",
      stage: "ready",
      progressPercent: 100,
    });

    const response = await POST({ formData: async () => formData } as Request);

    expect(response.status).toBe(201);
    expect(mocks.chatExists).toHaveBeenCalledWith(workspace, workspace.conversationId);
    expect(mocks.createIngestionJob).toHaveBeenCalledWith(
      workspace,
      expect.objectContaining({ chatId: workspace.conversationId, filename: "facts.txt" }),
    );
    expect(mocks.processIngestionJob).toHaveBeenCalledWith("job-1");
  });
});
