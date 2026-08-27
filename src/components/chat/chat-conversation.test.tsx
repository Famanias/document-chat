import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatConversation } from "@/components/chat/chat-conversation";
import type { ChatDetail } from "@/lib/chat/types";

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
    error: undefined,
    stop: vi.fn(),
  }),
}));

// Mock scrollIntoView which is not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("ChatConversation", () => {
  const dummyChat: ChatDetail = {
    id: "chat-1",
    title: "Quarterly Report Analysis",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    documents: [
      {
        id: "doc-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        status: "ready",
        pageCount: 10,
        chunkCount: 15,
        createdAt: new Date().toISOString(),
      },
    ],
    messages: [],
  };

  it("does not render an 'Add document' button in the top bar header", () => {
    render(
      <ChatConversation
        chat={dummyChat}
        uploadState={{ status: "idle" }}
        onUpload={vi.fn()}
        onMenu={vi.fn()}
        onConversationChanged={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /add document/i })).not.toBeInTheDocument();
  });

  it("renders a sidebar expand toggle button when isSidebarMinimized is true", () => {
    const handleToggle = vi.fn();
    render(
      <ChatConversation
        chat={dummyChat}
        uploadState={{ status: "idle" }}
        onUpload={vi.fn()}
        onMenu={vi.fn()}
        onConversationChanged={vi.fn()}
        isSidebarMinimized={true}
        onToggleSidebar={handleToggle}
      />,
    );

    const toggleButton = screen.getByRole("button", { name: /expand sidebar/i });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("does not render sidebar expand toggle button when isSidebarMinimized is false", () => {
    render(
      <ChatConversation
        chat={dummyChat}
        uploadState={{ status: "idle" }}
        onUpload={vi.fn()}
        onMenu={vi.fn()}
        onConversationChanged={vi.fn()}
        isSidebarMinimized={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /expand sidebar/i })).not.toBeInTheDocument();
  });
});
