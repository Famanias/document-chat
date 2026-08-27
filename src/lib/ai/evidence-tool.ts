import "server-only";

import { tool } from "ai";
import { z } from "zod";

import type { Evidence } from "@/lib/chat/types";

export function createEvidenceTools(evidence: Evidence[]) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  return {
    showEvidence: tool({
      description:
        "Select and display the retrieved document evidence that directly supports the answer. Use only the provided evidence IDs.",
      inputSchema: z.object({
        evidenceIds: z
          .array(z.string())
          .max(6)
          .describe("Evidence IDs that directly support the answer, in strongest-first order."),
      }),
      execute: async ({ evidenceIds }) => {
        const uniqueIds = [...new Set(evidenceIds)];
        return {
          evidence: uniqueIds
            .map((id) => evidenceById.get(id))
            .filter((item): item is Evidence => item !== undefined)
            .map((item) => ({
              id: item.id,
              chunkId: item.chunkId,
              documentId: item.documentId,
              filename: item.filename,
              pageNumber: item.pageNumber,
              section: item.section,
              chunkIndex: item.chunkIndex,
              excerpt: item.excerpt,
              similarity: item.similarity,
            })),
        };
      },
    }),
  };
}
