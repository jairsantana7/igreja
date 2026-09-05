import { describe, expect, it, vi } from 'vitest';
import type { AuditTrailRepository } from '../src/application/ports/audit-trail.port';
import { ListAuditEventsUseCase } from '../src/application/use-cases/audit-trail.use-case';
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

describe('trilha de auditoria', () => {
  it('exige audit.read antes de consultar o repositório', () => {
    const list = vi.fn();
    const useCase = new ListAuditEventsUseCase({ list } as unknown as AuditTrailRepository);
    expect(() => useCase.execute(principal([]))).toThrow(AuthorizationError);
    expect(list).not.toHaveBeenCalled();
  });

  it('limita a consulta às 100 atividades mais recentes', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const useCase = new ListAuditEventsUseCase({ list } as unknown as AuditTrailRepository);
    await expect(useCase.execute(principal(['audit.read']))).resolves.toEqual([]);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ userId: principal([]).userId }), 100, undefined);
  });
});
