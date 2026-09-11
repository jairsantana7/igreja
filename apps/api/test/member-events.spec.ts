import { describe, expect, it, vi } from 'vitest';
import { ListMemberEventsUseCase } from '../src/application/use-cases/member-events.use-case';
import { AuthorizationError } from '../src/application/use-cases/errors';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../src/domain/entities/permission';

const principal: AuthenticatedPrincipal = {
  userId: '10000000-0000-4000-8000-000000000002',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Membro',
  email: 'membro@example.test',
  roles: ['member'],
  permissions: [PERMISSIONS.eventsRegister, PERMISSIONS.memberEventsRead],
};

describe('ListMemberEventsUseCase', () => {
  it('consulta a projeção usando somente o principal autenticado', async () => {
    const view = { community: { id: principal.tenantId, name: 'Comunidade' }, available: [], registered: [] };
    const repository = { listForMember: vi.fn().mockResolvedValue(view) };
    const useCase = new ListMemberEventsUseCase(repository);

    await expect(useCase.execute(principal)).resolves.toEqual(view);
    expect(repository.listForMember).toHaveBeenCalledWith(principal);
  });

  it('recusa a leitura sem a permissão granular, mesmo fora do HTTP', async () => {
    const repository = { listForMember: vi.fn() };
    const useCase = new ListMemberEventsUseCase(repository);
    const unauthorized = { ...principal, permissions: [PERMISSIONS.eventsRegister] };

    expect(() => useCase.execute(unauthorized)).toThrow(AuthorizationError);
    expect(repository.listForMember).not.toHaveBeenCalled();
  });
});
