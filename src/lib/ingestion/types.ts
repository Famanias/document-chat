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
