import { ArgumentsHost, BadRequestException, Catch, ConflictException, ExceptionFilter, ForbiddenException, HttpException, Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError } from '../../application/use-cases/errors';
import { DomainError } from '../../domain/entities/errors';
import type { ApplicationLogger } from '../../application/ports/application-logger.port';
import { TOKENS } from '../../application/ports/tokens';

interface HttpResponse {
  status(code: number): { json(body: unknown): void };
}

@Catch()
@Injectable()
export class ApplicationExceptionFilter implements ExceptionFilter {
  constructor(@Inject(TOKENS.applicationLogger) private readonly logger: ApplicationLogger) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const httpError = this.toHttp(error);
    if (httpError.getStatus() >= 500) {
      const request = host.switchToHttp().getRequest<{ method?: string; originalUrl?: string }>();
      this.logger.captureException(error, {
        statusCode: httpError.getStatus(),
        method: request.method,
        path: request.originalUrl,
      });
    }
    const body = httpError.getResponse();
    response.status(httpError.getStatus()).json(typeof body === 'string' ? { statusCode: httpError.getStatus(), message: body } : body);
  }

  private toHttp(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof AuthenticationError) return new UnauthorizedException(error.message);
    if (error instanceof AuthorizationError) return new ForbiddenException(error.message);
    if (error instanceof ConflictError) return new ConflictException(error.message);
    if (error instanceof NotFoundError) return new NotFoundException(error.message);
    if (error instanceof DomainError) return new BadRequestException(error.message);
    if (error instanceof Error && error.message.startsWith('O ')) return new BadRequestException(error.message);
    return new InternalServerErrorException('Não foi possível concluir a operação.');
  }
}
