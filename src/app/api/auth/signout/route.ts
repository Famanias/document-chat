import { apiErrorResponse } from "@/lib/api-errors";
import { clearMemberSessionCookie } from "@/lib/auth/session";

export async function POST() {
  try {
    await clearMemberSessionCookie();
    return Response.json(
      { ok: true },
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
