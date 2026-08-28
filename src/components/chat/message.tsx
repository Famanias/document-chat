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
import { AlertCircle, Bot } from "lucide-react";

import { EvidenceCards } from "@/components/chat/evidence-cards";
import type { ChatMessage } from "@/lib/chat/types";

function plainTextForDisplay(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}

export function Message({ message }: { message: ChatMessage }) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const evidenceParts = message.parts.filter(
    (part) => part.type === "tool-showEvidence",
  );
  const displayText = message.role === "assistant" ? plainTextForDisplay(text) : text;

  if (message.role === "user") {
    return (
      <article className="flex justify-end" aria-label="Your message">
        <div className="max-w-[86%] rounded-2xl rounded-br-md bg-[#173f39] px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap text-white sm:max-w-[76%]">
          {displayText}
        </div>
      </article>
    );
  }

  return (
    <article className="flex gap-3" aria-label="Assistant message">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border bg-[var(--surface)] text-[var(--primary)]">
        <Bot aria-hidden="true" className="size-4" />
      </div>
      <div className="min-w-0 max-w-[780px] flex-1">
        {displayText ? (
          <div className="text-[15px] leading-7 whitespace-pre-wrap text-[#263531]">
            {displayText}
          </div>
        ) : null}
        {evidenceParts.map((part, index) => {
          if (part.state === "output-available") {
            return <EvidenceCards key={index} evidence={part.output.evidence} />;
          }
          if (part.state === "output-error") {
            return (
              <div
                key={index}
                className="mt-4 flex items-center gap-2 rounded-xl border border-[#f1c0ba] bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger)]"
              >
                <AlertCircle aria-hidden="true" className="size-4" />
                Supporting evidence could not be displayed.
              </div>
            );
          }
          return (
            <div key={index} className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
              <span className="size-1.5 rounded-full bg-[var(--primary)] thinking-dot" />
              Checking supporting passages…
            </div>
          );
        })}
      </div>
    </article>
  );
}
