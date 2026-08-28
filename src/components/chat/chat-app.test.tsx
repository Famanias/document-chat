import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatApp } from "@/components/chat/chat-app";
import type { ChatDetail } from "@/lib/chat/types";

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
    error: undefined,
    stop: vi.fn(),
    regenerate: vi.fn(),
  }),
}));

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

const chat: ChatDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: null,
  messages: [],
  documents: [],
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
};

describe("guest ChatApp", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens exactly one temporary conversation without a history list", async () => {
    const fetchMock = vi.fn(async () =>
      response({
        mode: "guest",
        chat,
        limits: { maxUploadBytes: 4 * 1024 * 1024, maxMessageCharacters: 12_000 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp />);

    expect(await screen.findByLabelText("Temporary conversation")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /conversations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new conversation/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/chats", undefined);
  });

  it("shows the configured upload limit before sending an oversized file", async () => {
    const fetchMock = vi.fn(async () =>
      response({
        mode: "guest",
        chat,
        limits: { maxUploadBytes: 1_024, maxMessageCharacters: 800 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatApp />);

    const input = await screen.findByLabelText("Choose a document");
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(1_025)], "too-large.txt", { type: "text/plain" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Temporary uploads are limited to 1 KB. Choose a smaller document.",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("retries a recoverable failed document instead of requiring another upload", async () => {
    const failedChat: ChatDetail = {
      ...chat,
      documents: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          filename: "resume.pdf",
          mimeType: "application/pdf",
          sizeBytes: 192_968,
          pageCount: null,
          chunkCount: 0,
          status: "failed",
          createdAt: "2026-08-27T00:00:00.000Z",
        },
      ],
    };
    const readyChat: ChatDetail = {
      ...failedChat,
      documents: failedChat.documents.map((document) => ({
        ...document,
        pageCount: 1,
        chunkCount: 4,
        status: "ready" as const,
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          mode: "member",
          chat: failedChat,
          user: { id: "member-1", email: "member@example.com" },
        }),
      )
      .mockResolvedValueOnce(response({ success: true, jobId: "job-1" }))
      .mockResolvedValueOnce(
        response({
          mode: "member",
          chat: readyChat,
          user: { id: "member-1", email: "member@example.com" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry indexing" }));

    await screen.findByText("Your document is ready");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/documents/22222222-2222-4222-8222-222222222222/reindex",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/chats", undefined);
  });
});
