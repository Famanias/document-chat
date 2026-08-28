import { render, screen } from "@testing-library/react";
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
    regenerate: vi.fn(),
  }),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const dummyChat: ChatDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Quarterly Report Analysis",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  documents: [],
  messages: [],
};

function renderConversation() {
  return render(
    <ChatConversation
      chat={dummyChat}
      limits={{ maxUploadBytes: 2 * 1024 * 1024, maxMessageCharacters: 800 }}
      uploadState={{ status: "idle" }}
      onUpload={vi.fn()}
      onConversationChanged={vi.fn()}
    />,
  );
}

describe("guest ChatConversation", () => {
  it("keeps the temporary-session notice visible and accessible", () => {
    renderConversation();

    expect(screen.getByLabelText("Temporary conversation")).toHaveTextContent(
      "Temporary — sign in to save.",
    );
  });

  it("has no history, new-conversation, or sidebar affordances", () => {
    renderConversation();

    expect(screen.queryByRole("navigation", { name: /conversations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new conversation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sidebar|conversations/i })).not.toBeInTheDocument();
  });

  it("renders the configured guest upload and message limits", () => {
    renderConversation();

    expect(screen.getByText(/Up to 2 MB/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ask a question about the document")).toHaveAttribute(
      "maxLength",
      "800",
    );
  });
});
