import { ArgumentsHost, BadRequestException, Catch, ConflictException, ExceptionFilter, ForbiddenException, HttpException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError } from '../../application/use-cases/errors';
import { DomainError } from '../../domain/entities/errors';

interface HttpResponse {
  status(code: number): { json(body: unknown): void };
}

@Catch()
export class ApplicationExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const httpError = this.toHttp(error);
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
