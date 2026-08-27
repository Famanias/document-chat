import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatApp } from "@/components/chat/chat-app";
import type { ChatDetail, ChatSummary } from "@/lib/chat/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function detail(id: string, title: string): ChatDetail {
  return {
    id,
    title,
    messages: [],
    documents: [],
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  };
}

describe("ChatApp", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not let a stale request replace the currently selected conversation", async () => {
    const firstId = "11111111-1111-4111-8111-111111111111";
    const secondId = "22222222-2222-4222-8222-222222222222";
    const chats: ChatSummary[] = [
      { id: firstId, title: "First chat", documentCount: 0, messageCount: 0, updatedAt: "2026-08-27T00:00:00.000Z" },
      { id: secondId, title: "Second chat", documentCount: 0, messageCount: 0, updatedAt: "2026-08-26T00:00:00.000Z" },
    ];
    const slowFirst = deferred<Response>();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/chats") return response({ chats });
      if (url.includes(firstId)) return slowFirst.promise;
      if (url.includes(secondId)) return response({ chat: detail(secondId, "Second chat") });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp />);

    const secondButton = await screen.findByRole("button", { name: /Second chat/ });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes(firstId))).toBe(true);
    });
    fireEvent.click(secondButton);
    expect(await screen.findByRole("heading", { name: "Second chat" })).toBeInTheDocument();

    await act(async () => {
      slowFirst.resolve(response({ chat: detail(firstId, "First chat") }));
      await slowFirst.promise;
    });

    expect(screen.getByRole("heading", { name: "Second chat" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "First chat" })).not.toBeInTheDocument();
  });
});
