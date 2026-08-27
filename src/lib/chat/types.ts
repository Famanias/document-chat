import type { InferUITools, UIMessage } from "ai";

import type { createEvidenceTools } from "@/lib/ai/evidence-tool";

export type Evidence = {
  id: string;
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  section: string | null;
  chunkIndex: number;
  content: string;
  excerpt: string;
  similarity: number;
};

export type EvidenceTools = InferUITools<ReturnType<typeof createEvidenceTools>>;
export type ChatMessage = UIMessage<never, never, EvidenceTools>;

export type DocumentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  chunkCount: number;
  status: "processing" | "ready" | "failed";
  createdAt: string;
};

export type ChatSummary = {
  id: string;
  title: string | null;
  documentCount: number;
  messageCount: number;
  updatedAt: string;
};

export type ChatDetail = {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  documents: DocumentSummary[];
  createdAt: string;
  updatedAt: string;
};
