import type { PasswordHasher } from '../ports/authentication.port';
import type { AccessControlRepository } from '../ports/access-control.port';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import { AuthorizationError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission) {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError('Você não tem permissão para administrar acessos.');
}

export class GetAccessControlUseCase {
  constructor(private readonly access: AccessControlRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.rolesRead);
    return this.access.list(principal);
  }
}

export class CreateRoleUseCase {
  constructor(private readonly access: AccessControlRepository) {}
  execute(principal: AuthenticatedPrincipal, input: { key: string; name: string; permissions: string[] }) {
    requirePermission(principal, PERMISSIONS.rolesManage);
    return this.access.createRole(principal, { ...input, key: input.key.toLowerCase().trim() });
  }
}

export class CreateUserUseCase {
  constructor(private readonly access: AccessControlRepository, private readonly passwords: PasswordHasher) {}
  async execute(principal: AuthenticatedPrincipal, input: { name: string; email: string; password: string; roleIds: string[] }) {
    requirePermission(principal, PERMISSIONS.usersCreate);
    return this.access.createUser(principal, {
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      passwordHash: await this.passwords.hash(input.password),
      roleIds: [...new Set(input.roleIds)],
    });
  }
}
