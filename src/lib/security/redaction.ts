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
export function redactSensitiveData<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("credential") ||
      lowerKey.includes("cookie") ||
      lowerKey.includes("token") ||
      lowerKey.includes("key")
    ) {
      result[key] = "[REDACTED]";
    } else if (lowerKey === "extractedtext" || lowerKey === "rawsourcebytes" || lowerKey === "content") {
      result[key] = typeof value === "string" ? `[CONTENT_LENGTH_${value.length}]` : "[REDACTED_CONTENT]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

export function logSecureEvent(event: string, metadata: Record<string, unknown> = {}) {
  const redacted = redactSensitiveData(metadata);
  const logEntry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...redacted,
  });
  // Output structured log entry
  if (process.env.NODE_ENV !== "test") {
    console.info(logEntry);
  }
}
