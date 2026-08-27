import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatApp } from "@/components/chat/chat-app";

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
    error: undefined,
    stop: vi.fn(),
  }),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("ChatApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/chats") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                chats: [
                  {
                    id: "chat-1",
                    title: "Test Chat",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    documentCount: 1,
                  },
                ],
              }),
          });
        }
        if (url.startsWith("/api/chats?id=")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                chat: {
                  id: "chat-1",
                  title: "Test Chat",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  documents: [],
                  messages: [],
                },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );
  });

  it("allows toggling sidebar minimize and persists preference", async () => {
    render(<ChatApp />);

    // Wait for the active conversation to load
    await waitFor(() => {
      expect(screen.getByText("No document attached")).toBeInTheDocument();
    });

    const minimizeButton = screen.getByRole("button", { name: /minimize sidebar/i });
    expect(minimizeButton).toBeInTheDocument();

    // Click minimize
    fireEvent.click(minimizeButton);
    expect(window.localStorage.getItem("grounded:sidebar-minimized")).toBe("true");

    // The expand button should now be available in the conversation header
    const expandButton = await screen.findByRole("button", { name: /expand sidebar/i });
    expect(expandButton).toBeInTheDocument();

    // Click expand
    fireEvent.click(expandButton);
    expect(window.localStorage.getItem("grounded:sidebar-minimized")).toBe("false");
  });
});
