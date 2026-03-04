type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, source: string, message: string, context?: LogContext): string {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${source}]`;
  const base = `${prefix} ${message}`;

  if (context && Object.keys(context).length > 0) {
    return `${base} ${JSON.stringify(context)}`;
  }

  return base;
}

export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
}

/** Create a logger scoped to a specific source (e.g., scraper name). */
export function createLogger(source: string): Logger {
  return {
    debug: (message, context) => console.debug(formatMessage('debug', source, message, context)),
    info: (message, context) => console.info(formatMessage('info', source, message, context)),
    warn: (message, context) => console.warn(formatMessage('warn', source, message, context)),
    error: (message, context) => console.error(formatMessage('error', source, message, context)),
  };
}
