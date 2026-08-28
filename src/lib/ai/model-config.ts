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
export const DEFAULT_PRODUCTION_CHAT_MODEL = "openrouter/free";
export const DEFAULT_PRODUCTION_EMBEDDING_MODEL = "liquid/lfm-2.5-embedding-350m:free";
export const EMBEDDING_DIMENSIONS = 1_024;

export type ModelConfig = {
  chat: string;
  embedding: string;
  embeddingDimensions: number;
};

export function getModelConfig(): ModelConfig {
  const chat = process.env.OPENROUTER_CHAT_MODEL ?? DEFAULT_PRODUCTION_CHAT_MODEL;
  const embedding = process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_PRODUCTION_EMBEDDING_MODEL;

  return {
    chat,
    embedding,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
  };
}

export const modelConfig = {
  get chat() {
    return getModelConfig().chat;
  },
  get embedding() {
    return getModelConfig().embedding;
  },
  embeddingDimensions: EMBEDDING_DIMENSIONS,
} as const;
