import { z } from "zod";

import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { reindexDocument } from "@/lib/documents/manage";
import { assertSameOrigin } from "@/lib/security/origin";
import { resolveWorkspace } from "@/lib/workspaces/context";

const reindexSchema = z.object({
  chatId: z.string().uuid(),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await props.params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = reindexSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, "Provide a valid conversation ID.");
    }

    const workspace = await resolveWorkspace();
    const result = await reindexDocument(workspace, parsed.data.chatId, id);

    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
