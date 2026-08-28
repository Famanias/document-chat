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
