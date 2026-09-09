import type { PasswordHasher } from '../ports/authentication.port';
import type { MemberOnboardingSecurity } from '../ports/member-onboarding-security.port';
import type { AccessControlRepository } from '../ports/access-control.port';
import type { MemberOnboardingRepository } from '../ports/member-onboarding.port';
import { MemberProfileDraft } from '../../domain/entities/member-profile';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import { AuthorizationError, NotFoundError } from './errors';
import { DomainError } from '../../domain/entities/errors';

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

export class UpdateUserNameUseCase {
  constructor(private readonly access: AccessControlRepository) {}
  async execute(principal: AuthenticatedPrincipal, userId: string, input: { name: string }) {
    requirePermission(principal, PERMISSIONS.usersUpdate);
    const name = input.name.trim();
    if (name.length < 2 || name.length > 120) throw new DomainError('Informe o nome do membro com 2 a 120 caracteres.');
    const member = await this.access.updateUserName(principal, userId, name);
    if (!member) throw new NotFoundError('Membro não encontrado nesta comunidade.');
    return member;
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
  constructor(
    private readonly onboarding: MemberOnboardingRepository,
    private readonly passwords: PasswordHasher,
    private readonly security: MemberOnboardingSecurity,
  ) {}
  async execute(principal: AuthenticatedPrincipal, input: {
    name: string;
    email: string;
    roleIds: string[];
    profile: Parameters<typeof MemberProfileDraft.create>[0];
  }) {
    requirePermission(principal, PERMISSIONS.usersCreate);
    requirePermission(principal, PERMISSIONS.memberProfilesManage);
    if (!input.profile.phone?.trim()) throw new DomainError('Informe o WhatsApp para preparar a entrega de acesso.');
    const profile = MemberProfileDraft.create(input.profile);
    const generated = this.security.generate();
    return this.onboarding.create(principal, {
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      passwordHash: await this.passwords.hash(generated.temporaryPassword),
      roleIds: [...new Set(input.roleIds)],
      profile,
      delivery: {
        phone: profile.props.phone!,
        tokenHash: generated.tokenHash,
        encryptedPayload: generated.encryptedPayload,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      },
    });
  }
}
