import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SessionRepository, TokenService } from '../../../application/ports/authentication.port';
import { TOKENS } from '../../../application/ports/tokens';
import type { AuthenticatedPrincipal } from '../../../domain/entities/permission';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKENS.tokenService) private readonly tokens: TokenService,
    @Inject(TOKENS.sessionRepository) private readonly sessions: SessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      principal?: AuthenticatedPrincipal;
    }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Autenticação necessária.');
    try {
      request.principal = await this.tokens.verify(token);
      if (!(await this.sessions.isActive(request.principal))) throw new Error('Sessão revogada.');
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }
}
