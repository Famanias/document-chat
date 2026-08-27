import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Message } from "@/components/chat/message";
import type { ChatMessage } from "@/lib/chat/types";

describe("Message", () => {
  it("does not expose stray Markdown markers from a plain-text model response", () => {
    const message: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "The approved budget is **USD 2.4 million**." }],
    };

    render(<Message message={message} />);

    expect(screen.getByText("The approved budget is USD 2.4 million.")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });
});
