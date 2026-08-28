import { z } from "zod";

const stableIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a stable kebab-case ID.");

const vectorSchema = z.array(z.number().finite()).min(1);

const sourceLocationSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("page"), pageNumber: z.number().int().positive() })
    .strict(),
  z.object({ kind: z.literal("section"), section: z.string().min(1) }).strict(),
  z
    .object({ kind: z.literal("passage"), chunkIndex: z.number().int().nonnegative() })
    .strict(),
]);

const documentSchema = z
  .object({
    id: stableIdSchema,
    fixture: z.string().regex(/^fixtures\//, "Fixture paths must start with fixtures/."),
    format: z.enum(["pdf", "txt", "md"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    controlledChunkEmbeddings: z.array(vectorSchema).min(1),
  })
  .strict();

const supportSchema = z
  .object({
    documentId: stableIdSchema,
    location: sourceLocationSchema,
  })
  .strict();

const acceptableEvidenceSchema = z
  .object({
    documentId: stableIdSchema,
    chunkIndexes: z.array(z.number().int().nonnegative()).min(1),
  })
  .strict();

const caseSchema = z
  .object({
    id: stableIdSchema,
    behaviors: z
      .array(
        z.enum([
          "exact-fact",
          "multi-page-evidence",
          "competing-documents",
          "unsupported-answer",
          "source-location",
        ]),
      )
      .min(1),
    question: z.string().min(1),
    intent: z.enum(["supported", "no-answer"]),
    expectedFacts: z.array(z.string().min(1)),
    expectedSupportingLocations: z.array(supportSchema),
    acceptableEvidence: z.array(acceptableEvidenceSchema),
    controlledQueryEmbedding: vectorSchema,
  })
  .strict();

const retrievalDatasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    datasetId: stableIdSchema,
    datasetVersion: z.number().int().positive(),
    description: z.string().min(1),
    controlledRun: z
      .object({
        embeddingId: stableIdSchema,
        dimensions: z.number().int().positive(),
        selectionSimilarityThreshold: z.number().min(-1).max(1),
        selectionLimit: z.number().int().positive().max(6),
      })
      .strict(),
    documents: z.array(documentSchema).min(1),
    cases: z.array(caseSchema).min(1),
  })
  .strict();

export type RetrievalDataset = z.infer<typeof retrievalDatasetSchema>;
export type RetrievalCase = RetrievalDataset["cases"][number];
export type SourceLocation = z.infer<typeof sourceLocationSchema>;

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function parseRetrievalDataset(value: unknown) {
  const result = retrievalDatasetSchema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "dataset"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid retrieval evaluation dataset: ${details}`);
  }

  const dataset = result.data;
  const duplicateDocumentIds = duplicateValues(
    dataset.documents.map((document) => document.id),
  );
  const duplicateCaseIds = duplicateValues(dataset.cases.map((item) => item.id));
  if (duplicateDocumentIds.length > 0 || duplicateCaseIds.length > 0) {
    throw new Error(
      `Invalid retrieval evaluation dataset: duplicate IDs (${[
        ...duplicateDocumentIds,
        ...duplicateCaseIds,
      ].join(", ")}).`,
    );
  }

  const documentIds = new Set(dataset.documents.map((document) => document.id));
  for (const document of dataset.documents) {
    for (const [index, embedding] of document.controlledChunkEmbeddings.entries()) {
      if (embedding.length !== dataset.controlledRun.dimensions) {
        throw new Error(
          `Invalid retrieval evaluation dataset: ${document.id} chunk ${index} has ${embedding.length} controlled dimensions; expected ${dataset.controlledRun.dimensions}.`,
        );
      }
    }
  }

  for (const evaluationCase of dataset.cases) {
    if (
      evaluationCase.controlledQueryEmbedding.length !==
      dataset.controlledRun.dimensions
    ) {
      throw new Error(
        `Invalid retrieval evaluation dataset: ${evaluationCase.id} query has ${evaluationCase.controlledQueryEmbedding.length} controlled dimensions; expected ${dataset.controlledRun.dimensions}.`,
      );
    }

    const referencedDocumentIds = [
      ...evaluationCase.expectedSupportingLocations.map(
        (support) => support.documentId,
      ),
      ...evaluationCase.acceptableEvidence.map(
        (evidence) => evidence.documentId,
      ),
    ];
    const missingDocument = referencedDocumentIds.find(
      (documentId) => !documentIds.has(documentId),
    );
    if (missingDocument) {
      throw new Error(
        `Invalid retrieval evaluation dataset: ${evaluationCase.id} references unknown document ${missingDocument}.`,
      );
    }

    const supported = evaluationCase.intent === "supported";
    const expectationCounts = [
      evaluationCase.expectedFacts.length,
      evaluationCase.expectedSupportingLocations.length,
      evaluationCase.acceptableEvidence.length,
    ];
    const invalidExpectations = supported
      ? expectationCounts.some((count) => count === 0)
      : expectationCounts.some((count) => count > 0);
    if (invalidExpectations) {
      throw new Error(
        `Invalid retrieval evaluation dataset: ${evaluationCase.id} must ${
          supported ? "declare" : "omit"
        } expected facts, supporting locations, and acceptable evidence for intent ${evaluationCase.intent}.`,
      );
    }
  }

  return dataset;
}
