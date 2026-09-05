import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedPrincipal, Permission } from '../../../domain/entities/permission';
import type { AccessControlRepository } from '../../../application/ports/access-control.port';
import { TOKENS } from '../../../application/ports/tokens';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TOKENS.accessControlRepository) private readonly access: AccessControlRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    if (required.length === 0) return true;
    const request = context.switchToHttp().getRequest<{ principal?: AuthenticatedPrincipal }>();
    const principal = request.principal;
    const current = principal ? await this.access.refreshPrincipal(principal) : null;
    if (!current || required.some((permission) => !current.permissions.includes(permission))) {
      throw new ForbiddenException('Você não tem permissão para realizar esta ação.');
    }
    request.principal = current;
    return true;
  }
}
