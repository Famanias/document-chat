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
