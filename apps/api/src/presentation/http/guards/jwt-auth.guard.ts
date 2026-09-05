import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { TokenService } from '../../../application/ports/authentication.port';
import { TOKENS } from '../../../application/ports/tokens';
import type { AuthenticatedPrincipal } from '../../../domain/entities/permission';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TOKENS.tokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      principal?: AuthenticatedPrincipal;
    }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Autenticação necessária.');
    try {
      request.principal = await this.tokens.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }
}
