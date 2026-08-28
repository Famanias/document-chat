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
