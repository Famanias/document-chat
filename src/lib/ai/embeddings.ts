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
