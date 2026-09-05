import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedPrincipal, Permission } from '../../../domain/entities/permission';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    if (required.length === 0) return true;
    const principal = context.switchToHttp().getRequest<{ principal?: AuthenticatedPrincipal }>().principal;
    if (!principal || required.some((permission) => !principal.permissions.includes(permission))) {
      throw new ForbiddenException('Você não tem permissão para realizar esta ação.');
    }
    return true;
  }
}
