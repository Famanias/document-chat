import { beforeEach, describe, expect, it, vi } from "vitest";

const workspace = { workspaceId: "10000000-0000-4000-8000-000000000001" } as const;
const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  loadChat: vi.fn(),
  hasReadyDocuments: vi.fn(),
  saveMessage: vi.fn(),
  retrieveEvidence: vi.fn(),
}));

vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@/lib/chat/store", () => ({
  loadChat: mocks.loadChat,
  hasReadyDocuments: mocks.hasReadyDocuments,
  saveMessage: mocks.saveMessage,
}));

vi.mock("@/lib/ai/retrieve", () => ({
  retrieveEvidence: mocks.retrieveEvidence,
}));

import { POST } from "@/app/api/chat/route";

describe("chat route workspace isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue(workspace);
  });

  it("returns a non-enumerating 404 before retrieval for another workspace's chat", async () => {
    const guessedId = "20000000-0000-4000-8000-000000000012";
    mocks.loadChat.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: guessedId,
          message: {
            id: "question-1",
            role: "user",
            parts: [{ type: "text", text: "What is private?" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "That conversation no longer exists.",
    });
    expect(mocks.loadChat).toHaveBeenCalledWith(workspace, guessedId);
    expect(mocks.hasReadyDocuments).not.toHaveBeenCalled();
    expect(mocks.retrieveEvidence).not.toHaveBeenCalled();
    expect(mocks.saveMessage).not.toHaveBeenCalled();
  });
});
