import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed, embedMany } from "ai";

import { modelConfig, requireServerEnv } from "@/lib/env";

const EMBEDDING_BATCH_SIZE = 32;

function provider() {
  return createOpenRouter({
    apiKey: requireServerEnv("OPENROUTER_API_KEY"),
  });
}

function assertDimensions(embedding: number[]) {
  if (embedding.length !== modelConfig.embeddingDimensions) {
    throw new Error(
      `Embedding model returned ${embedding.length} dimensions; expected ${modelConfig.embeddingDimensions}.`,
    );
  }
}

export async function embedDocumentChunks(values: string[]) {
  const embeddings: number[][] = [];

  for (let index = 0; index < values.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = values.slice(index, index + EMBEDDING_BATCH_SIZE);
    const result = await embedMany({
      model: provider().textEmbeddingModel(modelConfig.embedding),
      values: batch,
    });
    result.embeddings.forEach(assertDimensions);
    embeddings.push(...result.embeddings);
  }

  return embeddings;
}

export async function embedQuery(value: string) {
  const result = await embed({
    model: provider().textEmbeddingModel(modelConfig.embedding),
    value,
  });
  assertDimensions(result.embedding);
  return result.embedding;
}
