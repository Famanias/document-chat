import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/api-errors";
import type { ChatDetail, ChatMessage, ChatSummary, DocumentSummary } from "@/lib/chat/types";
import { db } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/workspaces/context";

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

export async function createChat(workspace: WorkspaceContext) {
  const id = randomUUID();
  const rows = (await db().query(
    `
      INSERT INTO chats (id, workspace_id)
      SELECT $1, workspaces.id
      FROM workspaces
      WHERE workspaces.id = $2
      RETURNING id, title, created_at, updated_at
    `,
    [id, workspace.workspaceId],
  )) as unknown as ChatRow[];
  const chat = rows[0];
  if (!chat) throw new Error("The resolved workspace does not exist.");
  return {
    id: chat.id,
    title: chat.title,
    createdAt: isoDate(chat.created_at),
    updatedAt: isoDate(chat.updated_at),
  };
}

export async function listChats(workspace: WorkspaceContext): Promise<ChatSummary[]> {
  const rows = (await db().query(`
    SELECT
      chats.id,
      chats.title,
      chats.created_at,
      chats.updated_at,
      COUNT(DISTINCT chat_documents.document_id) AS document_count,
      COUNT(DISTINCT messages.id) AS message_count
    FROM chats
    LEFT JOIN chat_documents
      ON chat_documents.workspace_id = chats.workspace_id
      AND chat_documents.chat_id = chats.id
    LEFT JOIN messages
      ON messages.workspace_id = chats.workspace_id
      AND messages.chat_id = chats.id
    WHERE chats.workspace_id = $1
    GROUP BY chats.id
    ORDER BY chats.updated_at DESC
    LIMIT 50
  `, [workspace.workspaceId])) as unknown as ChatSummaryRow[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    documentCount: Number(row.document_count),
    messageCount: Number(row.message_count),
    updatedAt: isoDate(row.updated_at),
  }));
}

export async function loadChat(
  workspace: WorkspaceContext,
  chatId: string,
): Promise<ChatDetail | null> {
  const sql = db();
  const [chatRows, messageRows, documentRows] = await Promise.all([
    sql.query(
      `
        SELECT id, title, created_at, updated_at
        FROM chats
        WHERE workspace_id = $1 AND id = $2
      `,
      [workspace.workspaceId, chatId],
    ),
    sql.query(
      `
        SELECT id, role, content, structured_data
        FROM messages
        WHERE workspace_id = $1 AND chat_id = $2
        ORDER BY created_at, id
      `,
      [workspace.workspaceId, chatId],
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
        INNER JOIN chat_documents
          ON chat_documents.workspace_id = documents.workspace_id
          AND chat_documents.document_id = documents.id
        LEFT JOIN document_chunks
          ON document_chunks.workspace_id = documents.workspace_id
          AND document_chunks.document_id = documents.id
        WHERE documents.workspace_id = $1
          AND chat_documents.workspace_id = $1
          AND chat_documents.chat_id = $2
        GROUP BY documents.id
        ORDER BY documents.created_at
      `,
      [workspace.workspaceId, chatId],
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

export async function saveMessage(
  workspace: WorkspaceContext,
  chatId: string,
  message: ChatMessage,
) {
  const content = textFromMessage(message);
  const saved = (await db().query(
    `
      INSERT INTO messages (id, workspace_id, chat_id, role, content, structured_data)
      SELECT $1, chats.workspace_id, chats.id, $3, $4, $5::jsonb
      FROM chats
      WHERE chats.workspace_id = $6 AND chats.id = $2
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        structured_data = EXCLUDED.structured_data
      WHERE messages.workspace_id = EXCLUDED.workspace_id
        AND messages.chat_id = EXCLUDED.chat_id
        AND messages.role = EXCLUDED.role
      RETURNING id
    `,
    [
      message.id,
      chatId,
      message.role,
      content,
      JSON.stringify({ parts: message.parts }),
      workspace.workspaceId,
    ],
  )) as unknown as Array<{ id: string }>;

  if (saved.length !== 1) {
    if (!(await chatExists(workspace, chatId))) {
      throw new AppError(404, "That conversation no longer exists.");
    }
    throw new Error("A message ID cannot be reused across conversations or roles.");
  }

    throw new Error("A message ID cannot be reused across conversations or roles.");
  }

  if (message.role === "user" && content) {
    await db().query(
      `
        UPDATE chats
        SET
          title = COALESCE(title, LEFT($2, 72)),
          updated_at = NOW()
        WHERE workspace_id = $3 AND id = $1
      `,
      [chatId, content, workspace.workspaceId],
    );
  } else {
    await db().query(
      "UPDATE chats SET updated_at = NOW() WHERE workspace_id = $2 AND id = $1",
      [chatId, workspace.workspaceId],
    );
  }
}

export async function chatExists(workspace: WorkspaceContext, chatId: string) {
  const rows = (await db().query(
    "SELECT 1 FROM chats WHERE workspace_id = $1 AND id = $2 LIMIT 1",
    [workspace.workspaceId, chatId],
  )) as unknown as Record<string, unknown>[];
  return rows.length > 0;
}

export async function hasReadyDocuments(workspace: WorkspaceContext, chatId: string) {
  const rows = (await db().query(
    `
      SELECT 1
      FROM chat_documents
      INNER JOIN documents
        ON documents.workspace_id = chat_documents.workspace_id
        AND documents.id = chat_documents.document_id
      WHERE chat_documents.workspace_id = $1
        AND chat_documents.chat_id = $2
        AND documents.status = 'ready'
      LIMIT 1
    `,
    [workspace.workspaceId, chatId],
  )) as unknown as Record<string, unknown>[];
  return rows.length > 0;
}
