import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { embedDocumentChunks } from "@/lib/ai/embeddings";
import { chunkSegments } from "@/lib/documents/chunk";
import { parseDocument } from "@/lib/documents/parse";
import { storeDocument } from "@/lib/documents/store";
import { validateUpload } from "@/lib/documents/validate-upload";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const chatId = formData.get("chatId");
    const file = formData.get("file");

    if (typeof chatId !== "string" || !/^[0-9a-f-]{36}$/i.test(chatId)) {
      throw new AppError(400, "Invalid conversation ID.");
    }
    if (!(file instanceof File)) throw new AppError(400, "Choose a document to upload.");
    const { filename, extension } = validateUpload(file);

    const parsed = await parseDocument(extension, await file.arrayBuffer());
    const chunks = chunkSegments(parsed.segments);
    if (chunks.length === 0) throw new AppError(422, "No readable text was found in this document.");
    const embeddings = await embedDocumentChunks(chunks.map((chunk) => chunk.content));
    const document = await storeDocument({
      chatId,
      filename,
      mimeType: file.type || (extension === "pdf" ? "application/pdf" : "text/plain"),
      sizeBytes: file.size,
      parsed,
      chunks,
      embeddings,
    });

    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
