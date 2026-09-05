import type { PasswordHasher } from '../ports/authentication.port';
import type { AccessControlRepository } from '../ports/access-control.port';
import type { MemberOnboardingRepository } from '../ports/member-onboarding.port';
import { MemberProfileDraft } from '../../domain/entities/member-profile';
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

export class ListMembersUseCase {
  constructor(private readonly access: AccessControlRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.usersRead);
    return this.access.listMembers(principal);
  }
}

export class CreateRoleUseCase {
  constructor(private readonly access: AccessControlRepository) {}
  execute(principal: AuthenticatedPrincipal, input: { key: string; name: string; permissions: string[] }) {
    requirePermission(principal, PERMISSIONS.rolesManage);
    return this.access.createRole(principal, { ...input, key: input.key.toLowerCase().trim() });
  }
}

export class UpdateRolePermissionsUseCase {
  constructor(private readonly access: AccessControlRepository) {}
  execute(principal: AuthenticatedPrincipal, roleId: string, permissions: string[]) {
    requirePermission(principal, PERMISSIONS.rolesManage);
    return this.access.updateRolePermissions(principal, roleId, [...new Set(permissions)]);
  }
}

export class CreateUserUseCase {
  constructor(private readonly onboarding: MemberOnboardingRepository, private readonly passwords: PasswordHasher) {}
  async execute(principal: AuthenticatedPrincipal, input: {
    name: string;
    email: string;
    password: string;
    roleIds: string[];
    profile?: Parameters<typeof MemberProfileDraft.create>[0];
  }) {
    requirePermission(principal, PERMISSIONS.usersCreate);
    if (input.profile) requirePermission(principal, PERMISSIONS.memberProfilesManage);
    return this.onboarding.create(principal, {
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      passwordHash: await this.passwords.hash(input.password),
      roleIds: [...new Set(input.roleIds)],
      profile: input.profile ? MemberProfileDraft.create(input.profile) : undefined,
    });
  }
}
