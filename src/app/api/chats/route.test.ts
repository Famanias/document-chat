import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api-errors";

const workspace = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  conversationId: "10000000-0000-4000-8000-000000000011",
} as const;
const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  loadChat: vi.fn(),
  enforceGuestRequestLimit: vi.fn(),
}));

vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@/lib/chat/store", () => ({
  loadChat: mocks.loadChat,
}));

vi.mock("@/lib/guest/limits", () => ({
  enforceGuestRequestLimit: mocks.enforceGuestRequestLimit,
  guestLimits: () => ({
    maxUploadBytes: 4 * 1024 * 1024,
    maxMessageCharacters: 12_000,
    requestsPerMinute: 60,
  }),
}));

import { GET } from "@/app/api/chats/route";

describe("chats route workspace resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue(workspace);
  });

  it("loads only the server-mapped guest conversation", async () => {
    mocks.loadChat.mockResolvedValue({ id: workspace.conversationId });

    const response = await GET(new Request("http://localhost/api/chats"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: "guest",
      chat: { id: workspace.conversationId },
    });
    expect(mocks.enforceGuestRequestLimit).toHaveBeenCalledWith(workspace);
    expect(mocks.loadChat).toHaveBeenCalledWith(workspace, workspace.conversationId);
  });

  it("returns the same 404 for a well-formed ID outside the workspace", async () => {
    const guessedId = "20000000-0000-4000-8000-000000000012";
    const response = await GET(
      new Request(`http://localhost/api/chats?id=${encodeURIComponent(guessedId)}`),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "That conversation no longer exists.",
    });
    expect(mocks.loadChat).not.toHaveBeenCalled();
  });

  it("returns persisted evidence parts when the guest reloads", async () => {
    const persistedChat = {
      id: workspace.conversationId,
      messages: [
        {
          id: "answer-1",
          role: "assistant",
          parts: [
            { type: "text", text: "A supported answer." },
            {
              type: "tool-showEvidence",
              state: "output-available",
              output: {
                evidence: [
                  {
                    id: "E1",
                    filename: "facts.txt",
                    pageNumber: null,
                    section: null,
                    chunkIndex: 0,
                    excerpt: "grounded facts",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    mocks.loadChat.mockResolvedValue(persistedChat);

    const response = await GET(new Request("http://localhost/api/chats"));

    await expect(response.json()).resolves.toMatchObject({ chat: persistedChat });
  });

  it("returns an actionable rate-limit state", async () => {
    mocks.enforceGuestRequestLimit.mockImplementationOnce(() => {
      throw new AppError(
        429,
        "Too many requests from this temporary conversation. Wait a minute and try again.",
        { responseHeaders: { "Retry-After": "42" } },
      );
    });

    const response = await GET(new Request("http://localhost/api/chats"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests from this temporary conversation. Wait a minute and try again.",
    });
  });
});
