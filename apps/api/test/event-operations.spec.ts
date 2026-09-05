import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import type { EventOperationsRepository } from '../src/application/ports/event-operations.port';
import { CheckInRegistrationUseCase, ListEventRegistrationsUseCase } from '../src/application/use-cases/event-operations.use-cases';
import { AuthorizationError, NotFoundError } from '../src/application/use-cases/errors';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Admin',
  email: 'admin@example.test',
  roles: ['admin'],
  permissions,
});

describe('operações do evento', () => {
  it('protege a lista de inscrições com permissão granular', async () => {
    const listRegistrations = vi.fn();
    const useCase = new ListEventRegistrationsUseCase({ listRegistrations } as unknown as EventOperationsRepository);
    await expect(useCase.execute(principal([]), 'event')).rejects.toThrow(AuthorizationError);
    expect(listRegistrations).not.toHaveBeenCalled();
  });

  it('protege o check-in e não mascara inscrição ausente', async () => {
    const checkIn = vi.fn().mockResolvedValue(null);
    const useCase = new CheckInRegistrationUseCase({ checkIn } as unknown as EventOperationsRepository);
    await expect(useCase.execute(principal(['events.checkin']), 'event', 'registration')).rejects.toThrow(NotFoundError);
  });
});
