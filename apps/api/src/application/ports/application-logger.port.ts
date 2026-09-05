export type LogContext = Record<string, string | number | boolean | null | undefined>;

export interface ApplicationLogger {
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  captureException(error: unknown, context?: LogContext): void;
}
