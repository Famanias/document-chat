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
import "server-only";

export type WorkspaceContext = Readonly<{
  workspaceId: string;
  conversationId: string;
  mode?: "guest" | "member";
  userId?: string;
  email?: string;
}>;

export const PRE_AUTH_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Resolve the current workspace on the server for every data operation.
 * Prioritizes authenticated member sessions; falls back to browser-session guest.
 */
export async function resolveWorkspace(): Promise<WorkspaceContext> {
  const { resolveMemberSession } = await import("@/lib/auth/session");
  const memberSession = await resolveMemberSession();

  if (memberSession) {
    const { listChats, createChat } = await import("@/lib/chat/store");
    const chats = await listChats({ workspaceId: memberSession.workspaceId, conversationId: "" });
    let conversationId = chats[0]?.id;
    if (!conversationId) {
      const created = await createChat({ workspaceId: memberSession.workspaceId, conversationId: "" });
      conversationId = created.id;
    }
    return Object.freeze({
      workspaceId: memberSession.workspaceId,
      conversationId,
      mode: "member" as const,
      userId: memberSession.userId,
      email: memberSession.email,
    });
  }

  const { resolveGuestWorkspace } = await import("@/lib/workspaces/guest-session");
  const guest = await resolveGuestWorkspace();
  return Object.freeze({
    ...guest,
    mode: "guest" as const,
  });
}
