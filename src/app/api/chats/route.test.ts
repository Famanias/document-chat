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

import { AppError } from "@/lib/api-errors";

const workspace = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  conversationId: "10000000-0000-4000-8000-000000000011",
} as const;
const newWorkspace = {
  workspaceId: "20000000-0000-4000-8000-000000000002",
  conversationId: "20000000-0000-4000-8000-000000000022",
} as const;

const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  loadChat: vi.fn(),
  enforceGuestRequestLimit: vi.fn(),
  resetGuestWorkspace: vi.fn(),
  endGuestSession: vi.fn(),
}));

vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
}));

vi.mock("@/lib/chat/store", () => ({
  loadChat: mocks.loadChat,
}));

vi.mock("@/lib/workspaces/guest-session", () => ({
  resetGuestWorkspace: mocks.resetGuestWorkspace,
  endGuestSession: mocks.endGuestSession,
}));

vi.mock("@/lib/guest/limits", () => ({
  enforceGuestRequestLimit: mocks.enforceGuestRequestLimit,
  guestLimits: () => ({
    maxUploadBytes: 4 * 1024 * 1024,
    maxMessageCharacters: 12_000,
    requestsPerMinute: 60,
  }),
}));

import { DELETE, GET } from "@/app/api/chats/route";

describe("chats route workspace resolution and lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue(workspace);
    mocks.resetGuestWorkspace.mockResolvedValue({ workspace: newWorkspace, credential: "new" });
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

  it("resets the guest conversation on DELETE ?action=reset", async () => {
    mocks.loadChat.mockResolvedValue({ id: newWorkspace.conversationId, messages: [], documents: [] });

    const response = await DELETE(new Request("http://localhost/api/chats?action=reset", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mocks.resetGuestWorkspace).toHaveBeenCalled();
    expect(mocks.loadChat).toHaveBeenCalledWith(newWorkspace, newWorkspace.conversationId);
    await expect(response.json()).resolves.toMatchObject({
      mode: "guest",
      chat: { id: newWorkspace.conversationId },
    });
  });

  it("ends the guest session on DELETE ?action=end", async () => {
    const response = await DELETE(new Request("http://localhost/api/chats?action=end", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mocks.endGuestSession).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
