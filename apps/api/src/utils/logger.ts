type LogContext = Record<string, unknown>;

const REDACTED_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|contentBase64)/i;

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (REDACTED_KEY.test(key)) return "[REDACTED]";
  if (depth >= 5) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitize(childValue, childKey, depth + 1)
      ])
    );
  }
  if (typeof value === "string" && value.length > 2_000) return `${value.slice(0, 2_000)}…`;
  return value;
}

function writeLog(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "api",
    message,
    ...(context ? (sanitize(context) as LogContext) : {})
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export function logInfo(message: string, context?: LogContext) {
  writeLog("info", message, context);
}

export function logWarn(message: string, context?: LogContext) {
  writeLog("warn", message, context);
}

export function logSecurity(message: string, context?: LogContext) {
  writeLog("warn", message, { eventKind: "security", ...context });
}

export function logError(message: string, context?: LogContext) {
  writeLog("error", message, context);
}
