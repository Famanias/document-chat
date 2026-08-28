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
