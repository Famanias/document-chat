import { z } from "zod";

import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { getOrCreateMemberWorkspace } from "@/lib/auth/store";
import { setMemberSessionCookie } from "@/lib/auth/session";

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = signinSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, "Provide a valid email address.");
    }

    const { email } = parsed.data;
    const providerSubject = `email|${email.toLowerCase()}`;

    const member = await getOrCreateMemberWorkspace(providerSubject, email);
    await setMemberSessionCookie({
      userId: member.id,
      email: member.email,
      workspaceId: member.workspaceId,
    });

    return Response.json(
      {
        ok: true,
        user: { id: member.id, email: member.email },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
