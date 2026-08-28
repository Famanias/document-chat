import { basename } from "node:path";

import type { Evidence } from "@/lib/chat/types";
import {
  rankEvidenceCandidates,
  RETRIEVAL_LIMIT,
  type RetrievalCandidate,
} from "@/lib/ai/retrieval-ranking";
import type {
  LoadedEvaluationDocument,
  LoadedRetrievalDataset,
} from "@/evaluation/retrieval/load-dataset";
import type { RetrievalCase } from "@/evaluation/retrieval/schema";

export type EvaluationCorpusChunk = {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  section: string | null;
  chunkIndex: number;
  content: string;
};

export type EvaluationEmbeddingSource = {
  id: string;
  dimensions: number;
  configuration: Record<string, string | number | boolean>;
  embedChunks: (chunks: readonly EvaluationCorpusChunk[]) => Promise<number[][]>;
  embedQuestions: (cases: readonly RetrievalCase[]) => Promise<number[][]>;
};

export type SemanticAnswerJudge = {
  criteriaMet: boolean[];
  groundedInSelectedEvidence: boolean;
  expectedBehaviorMet: boolean;
  notes: string;
};

export type EvidenceSelection = {
  selectedChunkIds: string[];
  shouldDecline: boolean;
  answer?: string;
  semanticJudge?: SemanticAnswerJudge;
  modelIdentity?: {
    requestedAnswerModel: string;
    actualAnswerModel: string;
    requestedJudgeModel: string;
    actualJudgeModel: string;
  };
};

export type EvaluationEvidenceSelector = {
  id: string;
  configuration: Record<string, string | number | boolean>;
  select: (
    evaluationCase: RetrievalCase,
    evidence: readonly Evidence[],
  ) => Promise<EvidenceSelection>;
};

type Metric = {
  numerator: number;
  denominator: number;
  score: number;
};

function score(numerator: number, denominator: number): Metric {
  return {
    numerator,
    denominator,
    score: denominator === 0 ? 0 : numerator / denominator,
  };
}

function chunkId(documentId: string, chunkIndex: number) {
  return `${documentId}:chunk-${chunkIndex}`;
}

function corpusChunks(documents: readonly LoadedEvaluationDocument[]) {
  return documents.flatMap((document): EvaluationCorpusChunk[] =>
    document.chunks.map((chunk) => ({
      chunkId: chunkId(document.id, chunk.chunkIndex),
      documentId: document.id,
      filename: basename(document.fixture),
      pageNumber: chunk.pageNumber,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
    })),
  );
}

function assertEmbeddings(
  label: string,
  embeddings: readonly number[][],
  expectedCount: number,
  dimensions: number,
) {
  if (embeddings.length !== expectedCount) {
    throw new Error(
      `${label} returned ${embeddings.length} embeddings; expected ${expectedCount}.`,
    );
  }
  const malformedIndex = embeddings.findIndex(
    (embedding) =>
      embedding.length !== dimensions ||
      embedding.some((coordinate) => !Number.isFinite(coordinate)),
  );
  if (malformedIndex >= 0) {
    throw new Error(
      `${label} embedding ${malformedIndex} must contain ${dimensions} finite dimensions.`,
    );
  }
}

function acceptableRequirements(evaluationCase: RetrievalCase) {
  return evaluationCase.acceptableEvidence.map(
    (requirement) =>
      new Set(
        requirement.chunkIndexes.map((index) =>
          chunkId(requirement.documentId, index),
        ),
      ),
  );
}

function roundSimilarity(value: number) {
  return Number(value.toFixed(6));
}

export function createControlledEmbeddingSource(
  dataset: LoadedRetrievalDataset,
): EvaluationEmbeddingSource {
  return {
    id: dataset.definition.controlledRun.embeddingId,
    dimensions: dataset.definition.controlledRun.dimensions,
    configuration: { source: "versioned fixture vectors" },
    embedChunks: async () =>
      dataset.documents.flatMap((document) =>
        document.controlledChunkEmbeddings.map((embedding) => [...embedding]),
      ),
    embedQuestions: async () =>
      dataset.definition.cases.map((item) => [...item.controlledQueryEmbedding]),
  };
}

export function createThresholdEvidenceSelector(
  threshold: number,
  limit: number,
): EvaluationEvidenceSelector {
  return {
    id: "similarity-threshold-v1",
    configuration: { threshold, limit },
    select: async (_evaluationCase, evidence) => {
      const selectedChunkIds = evidence
        .filter((item) => item.similarity >= threshold)
        .slice(0, limit)
        .map((item) => item.chunkId);
      return {
        selectedChunkIds,
        shouldDecline: selectedChunkIds.length === 0,
      };
    },
  };
}

export async function runRetrievalEvaluation(
  dataset: LoadedRetrievalDataset,
  embeddings: EvaluationEmbeddingSource,
  selector: EvaluationEvidenceSelector,
) {
  const chunks = corpusChunks(dataset.documents);
  const chunkEmbeddings = await embeddings.embedChunks(chunks);
  const queryEmbeddings = await embeddings.embedQuestions(dataset.definition.cases);
  assertEmbeddings(
    "Chunk embedder",
    chunkEmbeddings,
    chunks.length,
    embeddings.dimensions,
  );
  assertEmbeddings(
    "Question embedder",
    queryEmbeddings,
    dataset.definition.cases.length,
    embeddings.dimensions,
  );

  const candidates = chunks.map(
    (chunk, index): RetrievalCandidate => ({
      ...chunk,
      embedding: chunkEmbeddings[index],
    }),
  );

  const caseReports = [];
  let recallNumerator = 0;
  let recallDenominator = 0;
  let correctnessNumerator = 0;
  let correctnessDenominator = 0;
  let noAnswerNumerator = 0;
  let noAnswerDenominator = 0;
  let answerNumerator = 0;
  let answerDenominator = 0;

  for (const [caseIndex, evaluationCase] of dataset.definition.cases.entries()) {
    const evidence = rankEvidenceCandidates(
      queryEmbeddings[caseIndex],
      candidates,
      RETRIEVAL_LIMIT,
    );
    const selection = await selector.select(evaluationCase, evidence);
    const retrievedIds = new Set(evidence.map((item) => item.chunkId));
    const uniqueSelectedIds = [...new Set(selection.selectedChunkIds)];
    if (uniqueSelectedIds.length !== selection.selectedChunkIds.length) {
      throw new Error(`${selector.id} selected duplicate evidence for ${evaluationCase.id}.`);
    }
    const invalidSelection = uniqueSelectedIds.find((id) => !retrievedIds.has(id));
    if (invalidSelection) {
      throw new Error(
        `${selector.id} selected non-retrieved evidence ${invalidSelection} for ${evaluationCase.id}.`,
      );
    }

    const requirements = acceptableRequirements(evaluationCase);
    const acceptableIds = new Set(requirements.flatMap((item) => [...item]));
    const recallHits = requirements.filter((requirement) =>
      [...requirement].some((id) => retrievedIds.has(id)),
    ).length;
    const caseRecall =
      evaluationCase.intent === "supported"
        ? score(recallHits, requirements.length)
        : null;
    if (caseRecall) {
      recallNumerator += caseRecall.numerator;
      recallDenominator += caseRecall.denominator;
    }

    const correctSelections = uniqueSelectedIds.filter((id) =>
      acceptableIds.has(id),
    ).length;
    const caseCorrectness =
      evaluationCase.intent === "supported"
        ? score(correctSelections, Math.max(uniqueSelectedIds.length, 1))
        : null;
    if (caseCorrectness) {
      correctnessNumerator += caseCorrectness.numerator;
      correctnessDenominator += caseCorrectness.denominator;
    }

    const noAnswerSelection =
      evaluationCase.intent === "no-answer"
        ? score(uniqueSelectedIds.length === 0 ? 1 : 0, 1)
        : null;
    if (noAnswerSelection) {
      noAnswerNumerator += noAnswerSelection.numerator;
      noAnswerDenominator += noAnswerSelection.denominator;
    }

    let answerCorrectness: Metric | null = null;
    if (selection.semanticJudge) {
      const judge = selection.semanticJudge;
      const criteriaComplete =
        judge.criteriaMet.length === evaluationCase.expectedFacts.length &&
        judge.criteriaMet.every(Boolean);
      const passed =
        evaluationCase.intent === "supported"
          ? criteriaComplete &&
            judge.groundedInSelectedEvidence &&
            judge.expectedBehaviorMet &&
            !selection.shouldDecline
          : judge.expectedBehaviorMet && selection.shouldDecline;
      answerCorrectness = score(passed ? 1 : 0, 1);
      answerNumerator += answerCorrectness.numerator;
      answerDenominator += answerCorrectness.denominator;
    }

    caseReports.push({
      id: evaluationCase.id,
      intent: evaluationCase.intent,
      behaviors: evaluationCase.behaviors,
      retrieved: evidence.map((item, index) => ({
        rank: index + 1,
        chunkId: item.chunkId,
        documentId: item.documentId,
        pageNumber: item.pageNumber,
        section: item.section,
        chunkIndex: item.chunkIndex,
        similarity: roundSimilarity(item.similarity),
      })),
      selectedEvidenceChunkIds: uniqueSelectedIds,
      shouldDecline: selection.shouldDecline,
      answer: selection.answer,
      semanticJudge: selection.semanticJudge,
      modelIdentity: selection.modelIdentity,
      metrics: {
        retrievalRecall: caseRecall,
        evidenceCorrectness: caseCorrectness,
        noAnswerEvidenceSelection: noAnswerSelection,
        answerCorrectness,
      },
    });
  }

  return {
    artifactSchemaVersion: 1 as const,
    recordedAt: new Date().toISOString(),
    dataset: {
      id: dataset.definition.datasetId,
      version: dataset.definition.datasetVersion,
      fingerprint: dataset.fingerprint,
      caseCount: dataset.definition.cases.length,
      documentCount: dataset.definition.documents.length,
    },
    run: {
      retrieval: {
        algorithm: "cosine-similarity-v1",
        productionBoundary: "src/lib/ai/retrieval-ranking.ts#rankEvidenceCandidates",
        topK: RETRIEVAL_LIMIT,
      },
      embeddings: {
        id: embeddings.id,
        dimensions: embeddings.dimensions,
        configuration: embeddings.configuration,
      },
      evidenceSelection: {
        id: selector.id,
        configuration: selector.configuration,
      },
    },
    metrics: {
      retrievalRecall: score(recallNumerator, recallDenominator),
      evidenceCorrectness: score(
        correctnessNumerator,
        correctnessDenominator,
      ),
      noAnswerEvidenceSelection: score(
        noAnswerNumerator,
        noAnswerDenominator,
      ),
      answerCorrectness:
        answerDenominator > 0 ? score(answerNumerator, answerDenominator) : null,
    },
    cases: caseReports,
  };
}

export type RetrievalEvaluationReport = Awaited<
  ReturnType<typeof runRetrievalEvaluation>
>;

export function toComparableRetrievalReport(report: RetrievalEvaluationReport) {
  return { ...report, recordedAt: undefined };
}
