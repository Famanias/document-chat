import "server-only";

export function requireServerEnv(name: "DATABASE_URL" | "OPENROUTER_API_KEY") {
  const value = process.env[name]?.replace(/^\uFEFF/, "").trim();
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export const modelConfig = {
  chat: process.env.OPENROUTER_CHAT_MODEL ?? "openrouter/free",
  embedding:
    process.env.OPENROUTER_EMBEDDING_MODEL ??
    "liquid/lfm-2.5-embedding-350m:free",
  embeddingDimensions: 1_024,
} as const;
