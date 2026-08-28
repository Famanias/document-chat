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
import { z } from "zod";

import {
  DEFAULT_GUEST_MAX_MESSAGE_CHARACTERS,
  guestLimits,
} from "@/lib/guest/limits";

export const MAX_QUESTION_CHARACTERS = DEFAULT_GUEST_MAX_MESSAGE_CHARACTERS;

function schemaFor(maxCharacters: number) {
  const textPartSchema = z
    .object({
      type: z.literal("text"),
      text: z.string().max(maxCharacters),
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
            maxCharacters,
        ),
    })
    .strict();

  return z
    .object({
      id: z.string().uuid(),
      message: userMessageSchema,
      retry: z.boolean().optional().default(false),
    })
    .strict();
}

export function validateChatRequest(
  value: unknown,
  maxCharacters = guestLimits().maxMessageCharacters,
) {
  const result = schemaFor(maxCharacters).safeParse(value);
  return result.success ? result.data : null;
}

export function submittedMessageCharacters(value: unknown) {
  if (!value || typeof value !== "object" || !("message" in value)) return null;
  const message = value.message;
  if (!message || typeof message !== "object" || !("parts" in message)) return null;
  if (!Array.isArray(message.parts)) return null;

  let total = 0;
  for (const part of message.parts) {
    if (!part || typeof part !== "object" || !("text" in part)) return null;
    if (typeof part.text !== "string") return null;
    total += part.text.length;
  }
  return total;
}
