import { describe, expect, it, vi } from 'vitest';
import type { AccessControlRepository } from '../src/application/ports/access-control.port';
import { CreateUserUseCase, ListMembersUseCase, UpdateRolePermissionsUseCase } from '../src/application/use-cases/access-control.use-cases';
import { AuthorizationError } from '../src/application/use-cases/errors';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import type { MemberOnboardingRepository } from '../src/application/ports/member-onboarding.port';
import type { PasswordHasher } from '../src/application/ports/authentication.port';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Admin',
  email: 'admin@example.test',
  roles: ['admin'],
  permissions,
});

describe('listagem de membros', () => {
  it('exige users.read antes de consultar o repositório', async () => {
    const listMembers = vi.fn();
    const useCase = new ListMembersUseCase({ listMembers } as unknown as AccessControlRepository);
    expect(() => useCase.execute(principal([]))).toThrow(AuthorizationError);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('delega a consulta quando o usuário possui a permissão', async () => {
    const members = [{
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Pessoa',
      email: 'pessoa@example.test',
      createdAt: '2026-09-05T00:00:00.000Z',
      roles: [],
      confirmedRegistrations: 0,
    }];
    const listMembers = vi.fn().mockResolvedValue(members);
    const useCase = new ListMembersUseCase({ listMembers } as unknown as AccessControlRepository);
    await expect(useCase.execute(principal(['users.read']))).resolves.toEqual(members);
    expect(listMembers).toHaveBeenCalledOnce();
  });
});

describe('edição de permissões de papel', () => {
  it('exige roles.manage antes de alterar o papel', () => {
    const updateRolePermissions = vi.fn();
    const useCase = new UpdateRolePermissionsUseCase({ updateRolePermissions } as unknown as AccessControlRepository);
    expect(() => useCase.execute(principal([]), '20000000-0000-4000-8000-000000000001', ['events.read'])).toThrow(AuthorizationError);
    expect(updateRolePermissions).not.toHaveBeenCalled();
  });

  it('remove permissões duplicadas antes de persistir', async () => {
    const updateRolePermissions = vi.fn().mockResolvedValue({ id: 'role' });
    const useCase = new UpdateRolePermissionsUseCase({ updateRolePermissions } as unknown as AccessControlRepository);
    await useCase.execute(
      principal(['roles.manage']),
      '20000000-0000-4000-8000-000000000001',
      ['events.read', 'events.read'],
    );
    expect(updateRolePermissions).toHaveBeenCalledWith(
      expect.any(Object),
      '20000000-0000-4000-8000-000000000001',
      ['events.read'],
    );
  });
});

describe('cadastro administrativo de membro', () => {
  const passwords = { hash: vi.fn().mockResolvedValue('hashed') } as unknown as PasswordHasher;

  it('exige a permissão de perfil quando recebe dados complementares', async () => {
    const create = vi.fn();
    const useCase = new CreateUserUseCase({ create } as unknown as MemberOnboardingRepository, passwords);
    await expect(useCase.execute(principal(['users.create']), {
      name: 'Pessoa', email: 'pessoa@example.test', password: 'uma-senha-segura', roleIds: ['role'],
      profile: { birthDate: '1990-01-01' },
    })).rejects.toThrow(AuthorizationError);
    expect(create).not.toHaveBeenCalled();
  });

  it('valida e encaminha o perfil para criação atômica', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'member' });
    const useCase = new CreateUserUseCase({ create } as unknown as MemberOnboardingRepository, passwords);
    await useCase.execute(principal(['users.create', 'members.profile_manage']), {
      name: ' Pessoa ', email: 'PESSOA@EXAMPLE.TEST', password: 'uma-senha-segura', roleIds: ['role', 'role'],
      profile: { birthDate: '1990-01-01' },
    });
    expect(create).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      name: 'Pessoa', email: 'pessoa@example.test', passwordHash: 'hashed', roleIds: ['role'],
      profile: expect.objectContaining({ props: expect.objectContaining({ birthDate: '1990-01-01' }) }),
    }));
  });
});
