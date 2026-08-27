import { beforeEach, describe, expect, it, vi } from "vitest";

const workspace = { workspaceId: "10000000-0000-4000-8000-000000000001" } as const;
const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  createChat: vi.fn(),
  listChats: vi.fn(),
  loadChat: vi.fn(),
}));

vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@/lib/chat/store", () => ({
  createChat: mocks.createChat,
  listChats: mocks.listChats,
  loadChat: mocks.loadChat,
}));

import { GET, POST } from "@/app/api/chats/route";

describe("chats route workspace resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue(workspace);
  });

  it("passes the server-resolved workspace to listing and creation", async () => {
    mocks.listChats.mockResolvedValue([]);
    mocks.createChat.mockResolvedValue({ id: "chat-a" });

    const listResponse = await GET(new Request("http://localhost/api/chats"));
    const createResponse = await POST();

    expect(listResponse.status).toBe(200);
    expect(createResponse.status).toBe(201);
    expect(mocks.listChats).toHaveBeenCalledWith(workspace);
    expect(mocks.createChat).toHaveBeenCalledWith(workspace);
  });

  it("returns the same 404 for a well-formed ID outside the workspace", async () => {
    const guessedId = "20000000-0000-4000-8000-000000000012";
    mocks.loadChat.mockResolvedValue(null);

    const response = await GET(
      new Request(`http://localhost/api/chats?id=${encodeURIComponent(guessedId)}`),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "That conversation no longer exists.",
    });
    expect(mocks.loadChat).toHaveBeenCalledWith(workspace, guessedId);
  });
});
