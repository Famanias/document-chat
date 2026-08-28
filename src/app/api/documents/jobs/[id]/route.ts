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
import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { getJob, retryJob } from "@/lib/ingestion/store";
import { processIngestionJob } from "@/lib/ingestion/worker";
import { resolveWorkspace } from "@/lib/workspaces/context";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    const workspace = await resolveWorkspace();
    const job = await getJob(workspace, id);
    if (!job) throw new AppError(404, "Ingestion job not found.");

    return Response.json({ job });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    const workspace = await resolveWorkspace();
    const job = await retryJob(workspace, id);
    await processIngestionJob(job.id);
    const updated = await getJob(workspace, id);

    return Response.json({ job: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
