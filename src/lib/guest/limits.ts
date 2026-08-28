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
import type { WorkspaceContext } from "@/lib/workspaces/context";

export const DEFAULT_GUEST_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const DEFAULT_GUEST_MAX_MESSAGE_CHARACTERS = 12_000;
export const DEFAULT_GUEST_REQUESTS_PER_MINUTE = 60;

export type GuestLimits = Readonly<{
  maxUploadBytes: number;
  maxMessageCharacters: number;
  requestsPerMinute: number;
}>;

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function guestLimits(): GuestLimits {
  return Object.freeze({
    maxUploadBytes: positiveInteger(
      "GUEST_MAX_UPLOAD_BYTES",
      DEFAULT_GUEST_MAX_UPLOAD_BYTES,
    ),
    maxMessageCharacters: positiveInteger(
      "GUEST_MAX_MESSAGE_CHARACTERS",
      DEFAULT_GUEST_MAX_MESSAGE_CHARACTERS,
    ),
    requestsPerMinute: positiveInteger(
      "GUEST_REQUESTS_PER_MINUTE",
      DEFAULT_GUEST_REQUESTS_PER_MINUTE,
    ),
  });
}

type RateWindow = { count: number; resetAt: number };

export class GuestRateLimiter {
  private readonly windows = new Map<string, RateWindow>();
  private operations = 0;

  consume(key: string, limit: number, now = Date.now()) {
    this.operations += 1;
    if (this.operations % 256 === 0) {
      for (const [windowKey, window] of this.windows) {
        if (window.resetAt <= now) this.windows.delete(windowKey);
      }
    }
    const existing = this.windows.get(key);
    const window =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + 60_000 }
        : existing;

    window.count += 1;
    this.windows.set(key, window);

    return {
      allowed: window.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
    };
  }
}

const guestRateLimiter = new GuestRateLimiter();

export function enforceGuestRequestLimit(workspace: WorkspaceContext) {
  const result = guestRateLimiter.consume(
    workspace.workspaceId,
    guestLimits().requestsPerMinute,
  );
  if (!result.allowed) {
    throw new AppError(
      429,
      "Too many requests from this temporary conversation. Wait a minute and try again.",
      { responseHeaders: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
}
