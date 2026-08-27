import { z } from "zod";

import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { createChat, listChats, loadChat } from "@/lib/chat/store";

const chatIdSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ chats: await listChats() });

    const parsedId = chatIdSchema.safeParse(id);
    if (!parsedId.success) throw new AppError(400, "Invalid conversation ID.");
    const chat = await loadChat(parsedId.data);
    if (!chat) throw new AppError(404, "That conversation no longer exists.");
    return Response.json({ chat });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST() {
  try {
    return Response.json({ chat: await createChat() }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
