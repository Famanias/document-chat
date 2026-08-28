import { z } from "zod";

import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { createChat, listChats, loadChat } from "@/lib/chat/store";
import { resolveWorkspace } from "@/lib/workspaces/context";

const chatIdSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const workspace = await resolveWorkspace();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ chats: await listChats(workspace) });

    const parsedId = chatIdSchema.safeParse(id);
    if (!parsedId.success) throw new AppError(400, "Invalid conversation ID.");
    const chat = await loadChat(workspace, parsedId.data);
    if (!chat) throw new AppError(404, "That conversation no longer exists.");
    return Response.json({ chat });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST() {
  try {
    const workspace = await resolveWorkspace();
    return Response.json({ chat: await createChat(workspace) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
