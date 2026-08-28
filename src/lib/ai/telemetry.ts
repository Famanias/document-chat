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
