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

  it("returns zero-budget production defaults when NODE_ENV is production", () => {
    setNodeEnv("production");
    delete process.env.OPENROUTER_CHAT_MODEL;
    delete process.env.OPENROUTER_EMBEDDING_MODEL;

    const config = getModelConfig();
    expect(config.chat).toBe("openrouter/free");
    expect(config.embedding).toBe("liquid/lfm-2.5-embedding-350m:free");
    expect(DEFAULT_PRODUCTION_CHAT_MODEL).toBe("openrouter/free");
    expect(DEFAULT_PRODUCTION_EMBEDDING_MODEL).toBe("liquid/lfm-2.5-embedding-350m:free");
  });

  it("accepts explicitly configured free models in production", () => {
    setNodeEnv("production");
    process.env.OPENROUTER_CHAT_MODEL = "meta-llama/llama-3-8b:free";
    process.env.OPENROUTER_EMBEDDING_MODEL = "liquid/lfm-2.5-embedding-350m:free";

    expect(getModelConfig()).toMatchObject({
      chat: "meta-llama/llama-3-8b:free",
      embedding: "liquid/lfm-2.5-embedding-350m:free",
    });
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
