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
import { logSecureEvent } from "@/lib/security/redaction";

export type ModelTelemetryEvent = {
  model: string;
  operation: "chat" | "embedding" | "rerank";
  durationMs: number;
  outcome: "success" | "rate_limited" | "error";
  retryCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
};

export function recordModelTelemetry(event: ModelTelemetryEvent): void {
  logSecureEvent("ai_model_invocation", {
    model: event.model,
    operation: event.operation,
    durationMs: event.durationMs,
    outcome: event.outcome,
    retryCount: event.retryCount ?? 0,
    promptTokens: event.promptTokens,
    completionTokens: event.completionTokens,
    errorMessage: event.errorMessage,
  });
}
