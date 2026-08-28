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
import { describe, expect, it } from "vitest";

import rawDataset from "../../../evaluation/retrieval/dataset.json";
import { loadRetrievalDataset } from "@/evaluation/retrieval/load-dataset";
import {
  createControlledEmbeddingSource,
  createThresholdEvidenceSelector,
  runRetrievalEvaluation,
} from "@/evaluation/retrieval/runner";
import { parseRetrievalDataset } from "@/evaluation/retrieval/schema";

describe("retrieval evaluation dataset", () => {
  it("fails clearly when controlled vectors have the wrong dimensions", () => {
    const malformed = structuredClone(rawDataset);
    malformed.cases[0].controlledQueryEmbedding = [1];

    expect(() => parseRetrievalDataset(malformed)).toThrow(
      "exact-fact-txt-survey-time query has 1 controlled dimensions; expected 8",
    );
  });

  it("rejects no-answer cases that declare supporting evidence", () => {
    const malformed = structuredClone(rawDataset);
    malformed.cases[0].intent = "no-answer";

    expect(() => parseRetrievalDataset(malformed)).toThrow(
      "must omit expected facts, supporting locations, and acceptable evidence",
    );
  });

  it("parses and chunks every versioned fixture through production document logic", async () => {
    const dataset = await loadRetrievalDataset();

    expect(dataset.definition.cases).toHaveLength(7);
    expect(
      dataset.documents.map((document) => ({
        format: document.format,
        chunks: document.chunks.length,
      })),
    ).toEqual([
      { format: "pdf", chunks: 3 },
      { format: "txt", chunks: 1 },
      { format: "md", chunks: 3 },
    ]);
    expect(dataset.documents[0].chunks.map((chunk) => chunk.pageNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(dataset.documents[2].chunks[1].section).toBe(
      "Meridian Habitat Handbook › Water Reclamation",
    );
  });

  it("records deterministic retrieval, evidence, and abstention metrics", async () => {
    const dataset = await loadRetrievalDataset();
    const report = await runRetrievalEvaluation(
      dataset,
      createControlledEmbeddingSource(dataset),
      createThresholdEvidenceSelector(
        dataset.definition.controlledRun.selectionSimilarityThreshold,
        dataset.definition.controlledRun.selectionLimit,
      ),
    );

    expect(report.metrics).toMatchObject({
      retrievalRecall: { numerator: 7, denominator: 7, score: 1 },
      evidenceCorrectness: {
        numerator: 7,
        denominator: 9,
        score: 7 / 9,
      },
      noAnswerEvidenceSelection: { numerator: 1, denominator: 1, score: 1 },
      answerCorrectness: null,
    });
    expect(report.cases[2].retrieved.slice(0, 2).map((item) => item.chunkId)).toEqual([
      "aurora-field-manual:chunk-1",
      "aurora-field-manual:chunk-0",
    ]);
    expect(report.cases.at(-1)).toMatchObject({
      id: "unsupported-antenna-warranty",
      selectedEvidenceChunkIds: [],
      shouldDecline: true,
    });
  });
});
