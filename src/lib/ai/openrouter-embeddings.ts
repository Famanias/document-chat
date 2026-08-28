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
