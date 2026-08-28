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
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";

import { chunkSegments } from "@/lib/documents/chunk";
import { parseDocumentCore } from "@/lib/documents/parse-core";
import type { DocumentChunk } from "@/lib/documents/types";
import {
  parseRetrievalDataset,
  type RetrievalDataset,
  type SourceLocation,
} from "@/evaluation/retrieval/schema";

export const DEFAULT_RETRIEVAL_DATASET_PATH = resolve(
  process.cwd(),
  "evaluation/retrieval/dataset.json",
);

export type LoadedEvaluationDocument = {
  id: string;
  fixture: string;
  format: "pdf" | "txt" | "md";
  chunks: DocumentChunk[];
  controlledChunkEmbeddings: number[][];
};

export type LoadedRetrievalDataset = {
  definition: RetrievalDataset;
  fingerprint: string;
  documents: LoadedEvaluationDocument[];
};

function arrayBuffer(bytes: Buffer) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function locationExists(chunks: readonly DocumentChunk[], location: SourceLocation) {
  if (location.kind === "page") {
    return chunks.some((chunk) => chunk.pageNumber === location.pageNumber);
  }
  if (location.kind === "section") {
    return chunks.some((chunk) => chunk.section === location.section);
  }
  return chunks.some((chunk) => chunk.chunkIndex === location.chunkIndex);
}

export async function loadRetrievalDataset(
  datasetPath = DEFAULT_RETRIEVAL_DATASET_PATH,
): Promise<LoadedRetrievalDataset> {
  const absoluteDatasetPath = resolve(datasetPath);
  let rawDataset: unknown;
  try {
    rawDataset = JSON.parse(await readFile(absoluteDatasetPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read retrieval dataset ${absoluteDatasetPath}.`, {
      cause: error,
    });
  }

  const definition = parseRetrievalDataset(rawDataset);
  const datasetDirectory = dirname(absoluteDatasetPath);
  const fixturesDirectory = resolve(datasetDirectory, "fixtures");
  const documents: LoadedEvaluationDocument[] = [];

  for (const document of definition.documents) {
    const fixturePath = resolve(datasetDirectory, document.fixture);
    const fixtureRelativePath = relative(fixturesDirectory, fixturePath);
    if (
      fixtureRelativePath === "" ||
      fixtureRelativePath.startsWith("..") ||
      isAbsolute(fixtureRelativePath)
    ) {
      throw new Error(
        `Invalid retrieval evaluation dataset: ${document.id} fixture escapes the fixtures directory.`,
      );
    }
    if (extname(fixturePath).slice(1).toLowerCase() !== document.format) {
      throw new Error(
        `Invalid retrieval evaluation dataset: ${document.id} format does not match its fixture extension.`,
      );
    }

    const bytes = await readFile(fixturePath);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== document.sha256) {
      throw new Error(
        `Invalid retrieval evaluation dataset: ${document.id} fixture hash changed; expected ${document.sha256}, received ${actualHash}.`,
      );
    }

    const parsed = await parseDocumentCore(document.format, arrayBuffer(bytes));
    const chunks = chunkSegments(parsed.segments);
    if (chunks.length !== document.controlledChunkEmbeddings.length) {
      throw new Error(
        `Invalid retrieval evaluation dataset: ${document.id} produced ${chunks.length} chunks but declares ${document.controlledChunkEmbeddings.length} controlled embeddings.`,
      );
    }

    documents.push({
      id: document.id,
      fixture: document.fixture,
      format: document.format,
      chunks,
      controlledChunkEmbeddings: document.controlledChunkEmbeddings,
    });
  }

  const documentsById = new Map(documents.map((document) => [document.id, document]));
  for (const evaluationCase of definition.cases) {
    for (const support of evaluationCase.expectedSupportingLocations) {
      const document = documentsById.get(support.documentId)!;
      if (!locationExists(document.chunks, support.location)) {
        throw new Error(
          `Invalid retrieval evaluation dataset: ${evaluationCase.id} support location does not exist in ${support.documentId}.`,
        );
      }
    }
    for (const evidence of evaluationCase.acceptableEvidence) {
      const chunkIndexes = new Set(
        documentsById
          .get(evidence.documentId)!
          .chunks.map((chunk) => chunk.chunkIndex),
      );
      const missingChunk = evidence.chunkIndexes.find(
        (chunkIndex) => !chunkIndexes.has(chunkIndex),
      );
      if (missingChunk !== undefined) {
        throw new Error(
          `Invalid retrieval evaluation dataset: ${evaluationCase.id} references missing chunk ${evidence.documentId}:${missingChunk}.`,
        );
      }
    }
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(definition))
    .digest("hex");
  return { definition, fingerprint, documents };
}
