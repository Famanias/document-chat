import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { chatExists } from "@/lib/chat/store";
import { validateUpload } from "@/lib/documents/validate-upload";
import { enforceGuestRequestLimit } from "@/lib/guest/limits";
import { createIngestionJob, getJob } from "@/lib/ingestion/store";
import { processIngestionJob } from "@/lib/ingestion/worker";
import { resolveWorkspace } from "@/lib/workspaces/context";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const workspace = await resolveWorkspace();
    enforceGuestRequestLimit(workspace);
    const formData = await request.formData();
    const chatId = formData.get("chatId");
    const file = formData.get("file");

    if (typeof chatId !== "string" || !/^[0-9a-f-]{36}$/i.test(chatId)) {
      throw new AppError(400, "Invalid conversation ID.");
    }
    if (chatId !== workspace.conversationId) {
      throw new AppError(404, "That conversation no longer exists.");
    }
    if (!(file instanceof File)) throw new AppError(400, "Choose a document to upload.");
    if (!(await chatExists(workspace, chatId))) {
      throw new AppError(404, "That conversation no longer exists.");
    }

    const { filename, extension } = validateUpload(file);
    const mimeType = file.type || (extension === "pdf" ? "application/pdf" : "text/plain");
    const buffer = Buffer.from(await file.arrayBuffer());

    const job = await createIngestionJob(workspace, {
      chatId,
      filename,
      mimeType,
      sizeBytes: file.size,
      buffer,
    });

    // Execute the durable state machine
    await processIngestionJob(job.id);
    const updatedJob = await getJob(workspace, job.id);

    return Response.json(
      {
        job: updatedJob,
        document: {
          id: job.documentId,
          filename: job.filename,
          status: updatedJob?.status ?? "processing",
        },
      },
      { status: updatedJob?.status === "ready" ? 201 : 202 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
