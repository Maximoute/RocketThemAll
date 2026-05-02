type LogContext = Record<string, unknown>;

function serializeContext(context?: LogContext) {
  if (!context) return "";
  try {
    return ` ${JSON.stringify(context)}`;
  } catch {
    return "";
  }
}

export function logInfo(message: string, context?: LogContext) {
  console.info(`[api:info] ${message}${serializeContext(context)}`);
}

export function logWarn(message: string, context?: LogContext) {
  console.warn(`[api:warn] ${message}${serializeContext(context)}`);
}

export function logSecurity(message: string, context?: LogContext) {
  console.warn(`[api:security] ${message}${serializeContext(context)}`);
}

export function logError(message: string, context?: LogContext) {
  console.error(`[api:error] ${message}${serializeContext(context)}`);
}
