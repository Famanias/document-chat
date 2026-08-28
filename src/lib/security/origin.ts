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

export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    throw new AppError(403, "Cross-site request blocked.");
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      // Remove port if standard or compare hostnames
      const originHost = originUrl.host;
      if (originHost !== host && !originHost.startsWith("localhost")) {
        throw new AppError(403, "Cross-origin request blocked.");
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(403, "Invalid request origin.");
    }
  }
}
