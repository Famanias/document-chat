import { z } from "zod";

import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { claimCurrentGuestSessionIfPresent } from "@/lib/auth/claim";
import { getOrCreateMemberWorkspace } from "@/lib/auth/store";
import { setMemberSessionCookie } from "@/lib/auth/session";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).optional(),
});

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, "Provide a valid email address and password (min 6 characters).");
    }

    const { email } = parsed.data;
    const providerSubject = `email|${email.toLowerCase()}`;

    const member = await getOrCreateMemberWorkspace(providerSubject, email);
    const session = {
      userId: member.id,
      email: member.email,
      workspaceId: member.workspaceId,
    };
    await setMemberSessionCookie(session);
    const claimResult = await claimCurrentGuestSessionIfPresent(session);

    return Response.json(
      {
        ok: true,
        user: { id: member.id, email: member.email },
        claimed: claimResult.claimed,
        chatId: claimResult.chatId,
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
