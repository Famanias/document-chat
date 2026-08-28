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
  loadChat: vi.fn(),
  hasReadyDocuments: vi.fn(),
  saveMessage: vi.fn(),
  retrieveEvidence: vi.fn(),
  enforceGuestRequestLimit: vi.fn(),
  streamText: vi.fn(),
  toUIMessageStream: vi.fn(),
  createUIMessageStreamResponse: vi.fn(),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => ({ chat: () => ({}) }),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: mocks.streamText,
    toUIMessageStream: mocks.toUIMessageStream,
    createUIMessageStreamResponse: mocks.createUIMessageStreamResponse,
  };
});

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

vi.mock("@/lib/guest/limits", () => ({
  enforceGuestRequestLimit: mocks.enforceGuestRequestLimit,
  guestLimits: () => ({
    maxUploadBytes: 4 * 1024 * 1024,
    maxMessageCharacters: 12_000,
    requestsPerMinute: 60,
  }),
  DEFAULT_GUEST_MAX_MESSAGE_CHARACTERS: 12_000,
}));

vi.mock("@/lib/env", () => ({
  modelConfig: { chat: "test-chat-model" },
  requireServerEnv: () => "test-key",
}));

import { POST } from "@/app/api/chat/route";

describe("chat route workspace isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue(workspace);
    mocks.streamText.mockReturnValue({ consumeStream: vi.fn(), stream: {} });
    mocks.toUIMessageStream.mockReturnValue({});
    mocks.createUIMessageStreamResponse.mockReturnValue(
      new Response("stream", { headers: { "content-type": "text/event-stream" } }),
    );
  });

  it("returns a non-enumerating 404 before retrieval for another workspace's chat", async () => {
    const guessedId = "20000000-0000-4000-8000-000000000012";
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
    expect(mocks.loadChat).not.toHaveBeenCalled();
    expect(mocks.hasReadyDocuments).not.toHaveBeenCalled();
    expect(mocks.retrieveEvidence).not.toHaveBeenCalled();
    expect(mocks.saveMessage).not.toHaveBeenCalled();
  });

  it("streams and persists a completed answer for the resolved guest", async () => {
    const userMessage = {
      id: "question-1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "What is grounded?" }],
    };
    const assistantMessage = {
      id: "answer-1",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "A supported answer." }],
    };
    mocks.loadChat.mockResolvedValue({
      id: workspace.conversationId,
      title: null,
      messages: [],
      documents: [],
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    });
    mocks.hasReadyDocuments.mockResolvedValue(true);
    mocks.retrieveEvidence.mockResolvedValue([]);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: workspace.conversationId, message: userMessage }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.saveMessage).toHaveBeenCalledWith(
      workspace,
      workspace.conversationId,
      userMessage,
    );
    expect(mocks.retrieveEvidence).toHaveBeenCalledWith(
      workspace,
      workspace.conversationId,
      "What is grounded?",
    );
    const streamOptions = mocks.toUIMessageStream.mock.calls[0]?.[0];
    await streamOptions.onEnd({
      outcome: { status: "completed" },
      responseMessage: assistantMessage,
    });
    expect(mocks.saveMessage).toHaveBeenLastCalledWith(
      workspace,
      workspace.conversationId,
      assistantMessage,
    );
  });
});
