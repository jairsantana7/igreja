import { describe, expect, it, vi } from 'vitest';
import type { AccessControlRepository } from '../src/application/ports/access-control.port';
import { ListMembersUseCase } from '../src/application/use-cases/access-control.use-cases';
import { AuthorizationError } from '../src/application/use-cases/errors';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';

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
