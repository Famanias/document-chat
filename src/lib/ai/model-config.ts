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
