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
