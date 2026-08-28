import { apiErrorResponse, AppError } from "@/lib/api-errors";
import { databaseGuestSessions } from "@/lib/workspaces/guest-session";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // If CRON_SECRET is not configured in development, allow local invocation
  if (!secret) return process.env.NODE_ENV !== "production";

  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");

  return (
    authHeader === `Bearer ${secret}` ||
    cronHeader === secret
  );
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    if (!isAuthorized(request)) {
      throw new AppError(401, "Unauthorized cron invocation.");
    }

    const url = new URL(request.url);
    const batchParam = url.searchParams.get("batchSize");
    const batchSize = batchParam ? Math.min(Math.max(Number.parseInt(batchParam, 10) || 50, 1), 500) : 50;

    const result = await databaseGuestSessions.cleanupExpired(batchSize, new Date());
    const durationMs = Date.now() - start;

    return Response.json({
      ok: true,
      cleanedCount: result.deletedCount,
      durationMs,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
