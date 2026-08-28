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
