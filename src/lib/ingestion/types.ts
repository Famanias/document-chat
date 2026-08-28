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
export type IngestionStage =
  | "queued"
  | "extracting"
  | "chunking"
  | "embedding"
  | "persisting"
  | "ready"
  | "failed";

export type IngestionJobStatus =
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type IngestionJob = Readonly<{
  id: string;
  workspaceId: string;
  chatId: string;
  documentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: IngestionJobStatus;
  stage: IngestionStage;
  progressPercent: number;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateJobInput = {
  chatId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};
