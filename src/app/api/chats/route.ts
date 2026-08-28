import { z } from "zod";

import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { loadChat } from "@/lib/chat/store";
import { enforceGuestRequestLimit, guestLimits } from "@/lib/guest/limits";
import { resolveWorkspace } from "@/lib/workspaces/context";

const chatIdSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const workspace = await resolveWorkspace();
    enforceGuestRequestLimit(workspace);
    const id = new URL(request.url).searchParams.get("id");
    const conversationId = id ?? workspace.conversationId;
    const parsedId = chatIdSchema.safeParse(conversationId);
    if (!parsedId.success) throw new AppError(400, "Invalid conversation ID.");
    if (parsedId.data !== workspace.conversationId) {
      throw new AppError(404, "That conversation no longer exists.");
    }
    const chat = await loadChat(workspace, workspace.conversationId);
    if (!chat) throw new AppError(404, "That conversation no longer exists.");
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
