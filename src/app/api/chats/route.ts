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
import { z } from "zod";

import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { createChat, listChats, loadChat } from "@/lib/chat/store";
import { enforceGuestRequestLimit, guestLimits } from "@/lib/guest/limits";
import { resolveWorkspace } from "@/lib/workspaces/context";
import { endGuestSession, resetGuestWorkspace } from "@/lib/workspaces/guest-session";

const chatIdSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const workspace = await resolveWorkspace();
    const isMember = workspace.mode === "member";

    if (!isMember) {
      enforceGuestRequestLimit(workspace);
    }

    const id = new URL(request.url).searchParams.get("id");
    const conversationId = id ?? workspace.conversationId;
    const parsedId = chatIdSchema.safeParse(conversationId);
    if (!parsedId.success) throw new AppError(400, "Invalid conversation ID.");

    if (!isMember && parsedId.data !== workspace.conversationId) {
      throw new AppError(404, "That conversation no longer exists.");
    }

    const chat = await loadChat(workspace, parsedId.data);
    if (!chat) throw new AppError(404, "That conversation no longer exists.");

    if (isMember) {
      const chats = await listChats(workspace);
      return Response.json(
        {
          mode: "member",
          chat,
          chats,
          user: { id: workspace.userId, email: workspace.email },
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    const limits = guestLimits();
    return Response.json({
      mode: "guest",
      chat,
      limits: {
        maxUploadBytes: limits.maxUploadBytes,
        maxMessageCharacters: limits.maxMessageCharacters,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST() {
  try {
    const workspace = await resolveWorkspace();
    if (workspace.mode !== "member") {
      throw new AppError(403, "Guests are limited to one temporary conversation. Sign in to save multiple conversations.");
    }

    const chat = await createChat(workspace);
    const detail = await loadChat(workspace, chat.id);
    return Response.json(
      { chat: detail },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "end";

    if (action === "reset") {
      const { workspace } = await resetGuestWorkspace();
      const chat = await loadChat(workspace, workspace.conversationId);
      if (!chat) throw new AppError(500, "Failed to create replacement conversation.");
      const limits = guestLimits();
      return Response.json({
        mode: "guest",
        chat,
        limits: {
          maxUploadBytes: limits.maxUploadBytes,
          maxMessageCharacters: limits.maxMessageCharacters,
        },
      });
    }

    if (action === "end") {
      await endGuestSession();
      return Response.json({ ok: true });
    }

    throw new AppError(400, "Unknown lifecycle action.");
  } catch (error) {
    return apiErrorResponse(error);
  }
}
