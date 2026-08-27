import { z } from "zod";

export const MAX_QUESTION_CHARACTERS = 12_000;

const textPartSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().max(MAX_QUESTION_CHARACTERS),
  })
  .strict();

const userMessageSchema = z
  .object({
    id: z.string().min(1).max(200),
    role: z.literal("user"),
    parts: z
      .array(textPartSchema)
      .min(1)
      .max(20)
      .refine(
        (parts) =>
          parts.reduce((total, part) => total + part.text.length, 0) <=
          MAX_QUESTION_CHARACTERS,
      ),
  })
  .strict();

const chatRequestSchema = z
  .object({
    id: z.string().uuid(),
    message: userMessageSchema,
    retry: z.boolean().optional().default(false),
  })
  .strict();

export function validateChatRequest(value: unknown) {
  const result = chatRequestSchema.safeParse(value);
  return result.success ? result.data : null;
}
