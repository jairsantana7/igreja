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
  it('exige audit.read antes de consultar o repositório', async () => {
    const list = vi.fn();
    const useCase = new ListAuditEventsUseCase({ list } as unknown as AuditTrailRepository);
    await expect(useCase.execute(principal([]))).rejects.toThrow(AuthorizationError);
    expect(list).not.toHaveBeenCalled();
  });

  it('pagina 25 atividades por padrão e gera cursor pela última linha', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      actorUserId: null, actorName: null, action: 'created' as const, resourceType: 'events', resourceId: 'resource',
      createdAt: new Date(Date.UTC(2026, 8, 5, 12, 0, 30 - index)).toISOString(),
    }));
    const list = vi.fn().mockResolvedValue(rows);
    const useCase = new ListAuditEventsUseCase({ list } as unknown as AuditTrailRepository);
    const page = await useCase.execute(principal(['audit.read']));
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).toBeTypeOf('string');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ userId: principal([]).userId }), {
      limit: 26, eventId: undefined, action: undefined, cursor: undefined,
    });
  });

  it('rejeita limite e cursor inválidos antes de consultar o repositório', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const useCase = new ListAuditEventsUseCase({ list } as unknown as AuditTrailRepository);
    await expect(useCase.execute(principal(['audit.read']), { limit: 101 })).rejects.toThrow('limite');
    await expect(useCase.execute(principal(['audit.read']), { cursor: 'inválido' })).rejects.toThrow('cursor');
    expect(list).not.toHaveBeenCalled();
  });
});
