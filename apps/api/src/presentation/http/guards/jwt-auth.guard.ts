import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SessionRepository, TokenService } from '../../../application/ports/authentication.port';
import { TOKENS } from '../../../application/ports/tokens';
import type { AuthenticatedPrincipal } from '../../../domain/entities/permission';
import type { SessionSecurity } from '../../../application/ports/authentication.port';
import { readCookie, SESSION_COOKIE_NAME } from '../session-http';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKENS.tokenService) private readonly tokens: TokenService,
    @Inject(TOKENS.sessionRepository) private readonly sessions: SessionRepository,
    @Inject(TOKENS.sessionSecurity) private readonly sessionSecurity: SessionSecurity,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { cookie?: string; 'x-session-proof'?: string; 'user-agent'?: string };
      principal?: AuthenticatedPrincipal;
    }>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    const proof = request.headers['x-session-proof'];
    if (!token || !proof) throw new UnauthorizedException('Autenticação necessária.');
    try {
      request.principal = await this.tokens.verify(token);
      const verification = this.sessionSecurity.verify(proof, { userAgent: request.headers['user-agent'] ?? 'unknown' });
      if (!verification || !(await this.sessions.isActive(request.principal, verification))) throw new Error('Sessão revogada.');
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }
}
