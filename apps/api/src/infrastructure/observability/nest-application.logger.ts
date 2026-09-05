import { Injectable, Logger } from '@nestjs/common';
import type { ApplicationLogger, LogContext } from '../../application/ports/application-logger.port';

@Injectable()
export class NestApplicationLogger implements ApplicationLogger {
  private readonly logger = new Logger('Application');

  info(event: string, context: LogContext = {}) {
    this.logger.log({ event, ...context });
  }

  warn(event: string, context: LogContext = {}) {
    this.logger.warn({ event, ...context });
  }

  captureException(error: unknown, context: LogContext = {}) {
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    this.logger.error({ event: 'unhandled_exception', errorType, ...context });
  }
}
