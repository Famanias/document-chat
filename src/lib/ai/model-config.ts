export const DEFAULT_PRODUCTION_CHAT_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_PRODUCTION_EMBEDDING_MODEL = "baai/bge-m3";
export const EMBEDDING_DIMENSIONS = 1_024;

export type ModelConfig = {
  chat: string;
  embedding: string;
  embeddingDimensions: number;
};

export function getModelConfig(): ModelConfig {
  const isProd = process.env.NODE_ENV === "production";
  const chat = process.env.OPENROUTER_CHAT_MODEL ?? DEFAULT_PRODUCTION_CHAT_MODEL;
  const embedding = process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_PRODUCTION_EMBEDDING_MODEL;

  if (isProd) {
    if (chat.includes(":free") || chat === "openrouter/free") {
      throw new Error("Production environment cannot use unpinned free-tier chat models. Configure OPENROUTER_CHAT_MODEL.");
    }
    if (embedding.includes(":free")) {
      throw new Error("Production environment cannot use unpinned free-tier embedding models. Configure OPENROUTER_EMBEDDING_MODEL.");
    }
  }

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
