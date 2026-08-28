import "server-only";

export { modelConfig } from "@/lib/ai/model-config";

export function requireServerEnv(name: "DATABASE_URL" | "OPENROUTER_API_KEY") {
  const value = process.env[name]?.replace(/^\uFEFF/, "").trim();
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}
