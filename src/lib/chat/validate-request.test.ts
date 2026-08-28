import { describe, expect, it } from "vitest";

import {
  MAX_QUESTION_CHARACTERS,
  validateChatRequest,
} from "@/lib/chat/validate-request";

const chatId = "11111111-1111-4111-8111-111111111111";

describe("validateChatRequest", () => {
  it("accepts the text-only UI message sent by the composer", () => {
    expect(
      validateChatRequest({
        id: chatId,
        message: { id: "question-1", role: "user", parts: [{ type: "text", text: "A question" }] },
      }),
    ).toMatchObject({ id: chatId, retry: false });
  });

  it.each([
    [{ id: chatId, message: { id: "question-1", role: "user", parts: [null] } }],
    [{ id: chatId, message: { id: "question-1", role: "assistant", parts: [{ type: "text", text: "No" }] } }],
    [{ id: chatId, message: { id: "question-1", role: "user", parts: [{ type: "text", text: "x".repeat(MAX_QUESTION_CHARACTERS + 1) }] } }],
  ])("rejects malformed or unsafe message input", (value) => {
    expect(validateChatRequest(value)).toBeNull();
  });

  it("honors a configured character limit", () => {
    expect(
      validateChatRequest(
        {
          id: chatId,
          message: {
            id: "question-1",
            role: "user",
            parts: [{ type: "text", text: "123456" }],
          },
        },
        5,
      ),
    ).toBeNull();
  });
});
