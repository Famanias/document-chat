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
