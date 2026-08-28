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
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed, embedMany } from "ai";

const EMBEDDING_BATCH_SIZE = 32;

type OpenRouterEmbeddingOptions = {
  apiKey: string;
  modelId: string;
  dimensions: number;
};

export function createOpenRouterEmbeddingFunctions(
  options: OpenRouterEmbeddingOptions,
) {
  const provider = createOpenRouter({ apiKey: options.apiKey });

  function assertDimensions(embedding: number[]) {
    if (embedding.length !== options.dimensions) {
      throw new Error(
        `Embedding model returned ${embedding.length} dimensions; expected ${options.dimensions}.`,
      );
    }
  }

  async function embedDocumentChunks(values: string[]) {
    const embeddings: number[][] = [];

    for (let index = 0; index < values.length; index += EMBEDDING_BATCH_SIZE) {
      const batch = values.slice(index, index + EMBEDDING_BATCH_SIZE);
      const result = await embedMany({
        model: provider.textEmbeddingModel(options.modelId),
        values: batch,
      });
      result.embeddings.forEach(assertDimensions);
      embeddings.push(...result.embeddings);
    }

    return embeddings;
  }

  async function embedQuery(value: string) {
    const result = await embed({
      model: provider.textEmbeddingModel(options.modelId),
      value,
    });
    assertDimensions(result.embedding);
    return result.embedding;
  }

  return { embedDocumentChunks, embedQuery };
}
