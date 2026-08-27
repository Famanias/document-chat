import { beforeEach, describe, expect, it, vi } from "vitest";

const workspace = { workspaceId: "10000000-0000-4000-8000-000000000001" } as const;
const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  chatExists: vi.fn(),
  parseDocument: vi.fn(),
  storeDocument: vi.fn(),
  embedDocumentChunks: vi.fn(),
}));

vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@/lib/chat/store", () => ({
  chatExists: mocks.chatExists,
}));

vi.mock("@/lib/documents/parse", () => ({
  parseDocument: mocks.parseDocument,
}));

vi.mock("@/lib/documents/store", () => ({
  storeDocument: mocks.storeDocument,
}));

vi.mock("@/lib/ai/embeddings", () => ({
  embedDocumentChunks: mocks.embedDocumentChunks,
}));

import { POST } from "@/app/api/documents/route";

describe("documents route workspace isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue(workspace);
  });

  it("rejects another workspace's chat before reading or embedding the file", async () => {
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
    expect(mocks.chatExists).toHaveBeenCalledWith(workspace, guessedId);
    expect(mocks.parseDocument).not.toHaveBeenCalled();
    expect(mocks.embedDocumentChunks).not.toHaveBeenCalled();
    expect(mocks.storeDocument).not.toHaveBeenCalled();
  });
});
