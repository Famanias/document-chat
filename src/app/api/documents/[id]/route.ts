import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { deleteDocument } from "@/lib/documents/manage";
import { assertSameOrigin } from "@/lib/security/origin";
import { resolveWorkspace } from "@/lib/workspaces/context";

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await props.params;
    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId");
    if (!chatId) throw new AppError(400, "Provide a valid conversation ID.");

    const workspace = await resolveWorkspace();
    const result = await deleteDocument(workspace, chatId, id);

    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
