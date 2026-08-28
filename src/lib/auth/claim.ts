import "server-only";

import { cookies } from "next/headers";

import { AppError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import type { MemberSession } from "@/lib/auth/types";
import {
  digestGuestCredential,
  GUEST_COOKIE_NAME,
  isGuestCredential,
} from "@/lib/workspaces/guest-session";

type GuestSessionRow = {
  workspace_id: string;
  chat_id: string;
};

export async function claimGuestConversation(
  guestCredential: string,
  memberSession: MemberSession,
): Promise<{ success: boolean; chatId: string }> {
  if (!isGuestCredential(guestCredential)) {
    throw new AppError(400, "Invalid guest credential.");
  }

  const digest = digestGuestCredential(guestCredential);
  const sql = db();

  const sessionRows = (await sql.query(
    `
      SELECT workspace_id, chat_id
      FROM guest_sessions
      WHERE credential_digest = $1
      LIMIT 1
    `,
    [digest],
  )) as unknown as GuestSessionRow[];

  const guestSession = sessionRows[0];
  if (!guestSession) {
    // Check if member already has a chat (replay idempotency)
    const existing = (await sql.query(
      `
        SELECT id
        FROM chats
        WHERE workspace_id = $1
        LIMIT 1
      `,
      [memberSession.workspaceId],
    )) as unknown as { id: string }[];

    if (existing.length > 0 && existing[0]) {
      return { success: true, chatId: existing[0].id };
    }
    throw new AppError(404, "Guest conversation not found or already claimed.");
  }

  const { workspace_id: guestWorkspaceId, chat_id: guestChatId } = guestSession;
  const memberWorkspaceId = memberSession.workspaceId;

  await sql.transaction((tx) => [
    tx`
      UPDATE chats
      SET workspace_id = ${memberWorkspaceId}, updated_at = NOW()
      WHERE workspace_id = ${guestWorkspaceId} AND id = ${guestChatId}
    `,
    tx`
      UPDATE document_chunks
      SET workspace_id = ${memberWorkspaceId}
      WHERE workspace_id = ${guestWorkspaceId}
        AND document_id IN (
          SELECT document_id FROM chat_documents WHERE workspace_id = ${guestWorkspaceId} AND chat_id = ${guestChatId}
        )
    `,
    tx`
      UPDATE documents
      SET workspace_id = ${memberWorkspaceId}
      WHERE workspace_id = ${guestWorkspaceId}
        AND id IN (
          SELECT document_id FROM chat_documents WHERE workspace_id = ${guestWorkspaceId} AND chat_id = ${guestChatId}
        )
    `,
    tx`
      UPDATE chat_documents
      SET workspace_id = ${memberWorkspaceId}
      WHERE workspace_id = ${guestWorkspaceId} AND chat_id = ${guestChatId}
    `,
    tx`
      UPDATE messages
      SET workspace_id = ${memberWorkspaceId}
      WHERE workspace_id = ${guestWorkspaceId} AND chat_id = ${guestChatId}
    `,
    tx`
      UPDATE ingestion_jobs
      SET workspace_id = ${memberWorkspaceId}
      WHERE workspace_id = ${guestWorkspaceId} AND chat_id = ${guestChatId}
    `,
    tx`
      DELETE FROM guest_sessions WHERE credential_digest = ${digest}
    `,
    tx`
      DELETE FROM workspaces WHERE id = ${guestWorkspaceId}
    `,
  ]);

  return { success: true, chatId: guestChatId };
}

export async function claimCurrentGuestSessionIfPresent(
  memberSession: MemberSession,
): Promise<{ claimed: boolean; chatId?: string }> {
  const cookieStore = await cookies();
  const guestCookie = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (isGuestCredential(guestCookie)) {
    try {
      const result = await claimGuestConversation(guestCookie, memberSession);
      cookieStore.delete(GUEST_COOKIE_NAME);
      return { claimed: true, chatId: result.chatId };
    } catch {
      cookieStore.delete(GUEST_COOKIE_NAME);
      return { claimed: false };
    }
  }

  return { claimed: false };
}
