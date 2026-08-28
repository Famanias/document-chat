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
import "server-only";

import { AppError } from "@/lib/api-errors";
import { db } from "@/lib/db";

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  try {
    const rows = (await db().query(
      `
        INSERT INTO rate_limit_buckets (key, count, reset_at)
        VALUES ($1, 1, NOW() + ($2 || ' seconds')::interval)
        ON CONFLICT (key) DO UPDATE
        SET count = CASE
          WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        reset_at = CASE
          WHEN rate_limit_buckets.reset_at <= NOW() THEN NOW() + ($2 || ' seconds')::interval
          ELSE rate_limit_buckets.reset_at
        END
        RETURNING count, reset_at
      `,
      [key, windowSeconds],
    )) as unknown as { count: number; reset_at: string }[];

    const currentCount = rows[0]?.count ?? 1;
    const allowed = currentCount <= limit;
    const remaining = Math.max(0, limit - currentCount);

    if (!allowed) {
      throw new AppError(429, "Rate limit exceeded. Please wait a moment before trying again.");
    }

    return { allowed, count: currentCount, limit, remaining };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Bounded fail-open policy for transient database limiter failure
    return { allowed: true, count: 1, limit, remaining: limit - 1 };
  }
}
