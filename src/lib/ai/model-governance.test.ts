import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PRODUCTION_CHAT_MODEL,
  DEFAULT_PRODUCTION_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  getModelConfig,
} from "@/lib/ai/model-config";
import { recordModelTelemetry } from "@/lib/ai/telemetry";

describe("AI model configuration & governance", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function setNodeEnv(value: string) {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  }

  it("returns development model defaults when NODE_ENV is development", () => {
    setNodeEnv("development");
    delete process.env.OPENROUTER_CHAT_MODEL;
    delete process.env.OPENROUTER_EMBEDDING_MODEL;

    const config = getModelConfig();
    expect(config.chat).toBe("openrouter/free");
    expect(config.embedding).toBe("liquid/lfm-2.5-embedding-350m:free");
    expect(config.embeddingDimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("returns pinned production defaults when NODE_ENV is production", () => {
    setNodeEnv("production");
    delete process.env.OPENROUTER_CHAT_MODEL;
    delete process.env.OPENROUTER_EMBEDDING_MODEL;

    const config = getModelConfig();
    expect(config.chat).toBe(DEFAULT_PRODUCTION_CHAT_MODEL);
    expect(config.embedding).toBe(DEFAULT_PRODUCTION_EMBEDDING_MODEL);
  });

  it("rejects free-tier chat models when NODE_ENV is production", () => {
    setNodeEnv("production");
    process.env.OPENROUTER_CHAT_MODEL = "meta-llama/llama-3-8b:free";

    expect(() => getModelConfig()).toThrow("Production environment cannot use unpinned free-tier");
  });

  it("records model telemetry without sensitive text", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    recordModelTelemetry({
      model: "google/gemini-2.5-flash",
      operation: "chat",
      durationMs: 450,
      outcome: "success",
      promptTokens: 120,
      completionTokens: 85,
    });

    spy.mockRestore();
  });
});
