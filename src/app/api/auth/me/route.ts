import { apiErrorResponse } from "@/lib/api-errors";
import { resolveMemberSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await resolveMemberSession();
    return Response.json(
      {
        authenticated: Boolean(session),
        user: session ? { id: session.userId, email: session.email } : null,
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
