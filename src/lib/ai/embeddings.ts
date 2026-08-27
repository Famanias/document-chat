import "server-only";

import { modelConfig } from "@/lib/ai/model-config";
import { createOpenRouterEmbeddingFunctions } from "@/lib/ai/openrouter-embeddings";
import { requireServerEnv } from "@/lib/env";

function functions() {
  return createOpenRouterEmbeddingFunctions({
    apiKey: requireServerEnv("OPENROUTER_API_KEY"),
    modelId: modelConfig.embedding,
    dimensions: modelConfig.embeddingDimensions,
  });
}

export async function embedDocumentChunks(values: string[]) {
  return functions().embedDocumentChunks(values);
}

export async function embedQuery(value: string) {
  return functions().embedQuery(value);
}
