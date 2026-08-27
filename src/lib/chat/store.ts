import "server-only";

import { randomUUID } from "node:crypto";

import type { ChatDetail, ChatMessage, ChatSummary, DocumentSummary } from "@/lib/chat/types";
import { db } from "@/lib/db";

type ChatRow = {
  id: string;
  title: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ChatSummaryRow = ChatRow & {
  document_count: number | string;
  message_count: number | string;
};

type MessageRow = {
  id: string;
  role: ChatMessage["role"];
  content: string;
  structured_data: unknown;
};

type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  chunk_count: number | string;
  status: DocumentSummary["status"];
  created_at: Date | string;
};

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function textFromMessage(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function partsFromRow(row: MessageRow): ChatMessage["parts"] {
  const data = row.structured_data;
  if (
    data &&
    typeof data === "object" &&
    "parts" in data &&
    Array.isArray(data.parts)
  ) {
    return data.parts as ChatMessage["parts"];
  }
  return [{ type: "text", text: row.content }];
}

export async function createChat() {
  const id = randomUUID();
  const rows = (await db().query(
    "INSERT INTO chats (id) VALUES ($1) RETURNING id, title, created_at, updated_at",
    [id],
  )) as unknown as ChatRow[];
  const chat = rows[0];
  return {
    id: chat.id,
    title: chat.title,
    createdAt: isoDate(chat.created_at),
    updatedAt: isoDate(chat.updated_at),
  };
}

export async function listChats(): Promise<ChatSummary[]> {
  const rows = (await db().query(`
    SELECT
      chats.id,
      chats.title,
      chats.created_at,
      chats.updated_at,
      COUNT(DISTINCT chat_documents.document_id) AS document_count,
      COUNT(DISTINCT messages.id) AS message_count
    FROM chats
    LEFT JOIN chat_documents ON chat_documents.chat_id = chats.id
    LEFT JOIN messages ON messages.chat_id = chats.id
    GROUP BY chats.id
    ORDER BY chats.updated_at DESC
    LIMIT 50
  `)) as unknown as ChatSummaryRow[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    documentCount: Number(row.document_count),
    messageCount: Number(row.message_count),
    updatedAt: isoDate(row.updated_at),
  }));
}

export async function loadChat(chatId: string): Promise<ChatDetail | null> {
  const sql = db();
  const [chatRows, messageRows, documentRows] = await Promise.all([
    sql.query("SELECT id, title, created_at, updated_at FROM chats WHERE id = $1", [chatId]),
    sql.query(
      "SELECT id, role, content, structured_data FROM messages WHERE chat_id = $1 ORDER BY created_at, id",
      [chatId],
    ),
    sql.query(
      `
        SELECT
          documents.id,
          documents.filename,
          documents.mime_type,
          documents.size_bytes,
          documents.page_count,
          documents.status,
          documents.created_at,
          COUNT(document_chunks.id) AS chunk_count
        FROM documents
        INNER JOIN chat_documents ON chat_documents.document_id = documents.id
        LEFT JOIN document_chunks ON document_chunks.document_id = documents.id
        WHERE chat_documents.chat_id = $1
        GROUP BY documents.id
        ORDER BY documents.created_at
      `,
      [chatId],
    ),
  ]);

  const chat = (chatRows as unknown as ChatRow[])[0];
  if (!chat) return null;

  return {
    id: chat.id,
    title: chat.title,
    createdAt: isoDate(chat.created_at),
    updatedAt: isoDate(chat.updated_at),
    messages: (messageRows as unknown as MessageRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      parts: partsFromRow(row),
    })),
    documents: (documentRows as unknown as DocumentRow[]).map((row) => ({
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      pageCount: row.page_count,
      chunkCount: Number(row.chunk_count),
      status: row.status,
      createdAt: isoDate(row.created_at),
    })),
  };
}

export async function saveMessage(chatId: string, message: ChatMessage) {
  const content = textFromMessage(message);
  const saved = (await db().query(
    `
      INSERT INTO messages (id, chat_id, role, content, structured_data)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        structured_data = EXCLUDED.structured_data
      WHERE messages.chat_id = EXCLUDED.chat_id
        AND messages.role = EXCLUDED.role
      RETURNING id
    `,
    [message.id, chatId, message.role, content, JSON.stringify({ parts: message.parts })],
  )) as unknown as Array<{ id: string }>;

  if (saved.length !== 1) {
    throw new Error("A message ID cannot be reused across conversations or roles.");
  }

  if (message.role === "user" && content) {
    await db().query(
      `
        UPDATE chats
        SET
          title = COALESCE(title, LEFT($2, 72)),
          updated_at = NOW()
        WHERE id = $1
      `,
      [chatId, content],
    );
  } else {
    await db().query("UPDATE chats SET updated_at = NOW() WHERE id = $1", [chatId]);
  }
}

export async function hasReadyDocuments(chatId: string) {
  const rows = (await db().query(
    `
      SELECT 1
      FROM chat_documents
      INNER JOIN documents ON documents.id = chat_documents.document_id
      WHERE chat_documents.chat_id = $1 AND documents.status = 'ready'
      LIMIT 1
    `,
    [chatId],
  )) as unknown as Record<string, unknown>[];
  return rows.length > 0;
}
