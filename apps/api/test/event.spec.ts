import { describe, expect, it, vi } from 'vitest';
import { canTransitionEvent, isRegistrationOpen } from '../src/domain/entities/event';
import type { EventRepository } from '../src/application/ports/event.port';
import { CancelEventUseCase, UpdateEventUseCase } from '../src/application/use-cases/event.use-cases';
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

const editableEvent = {
  title: 'Evento atualizado',
  description: '',
  location: '',
  startsAt: new Date('2026-10-10T18:00:00.000Z'),
  registrationDeadline: undefined,
  capacity: undefined,
  mediaDisplayMode: 'hero' as const,
  fields: [],
};

describe('abertura de inscrições', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  it('considera aberto um evento publicado, futuro e dentro do prazo', () => {
    expect(isRegistrationOpen({
      status: 'published',
      startsAt: new Date('2026-09-10T12:00:00.000Z'),
      registrationDeadline: new Date('2026-09-09T12:00:00.000Z'),
    }, now)).toBe(true);
  });

  it.each([
    { status: 'draft' as const, startsAt: '2026-09-10', deadline: '2026-09-09' },
    { status: 'cancelled' as const, startsAt: '2026-09-10', deadline: '2026-09-09' },
    { status: 'published' as const, startsAt: '2026-09-03', deadline: '2026-09-02' },
    { status: 'published' as const, startsAt: '2026-09-10', deadline: '2026-09-03' },
  ])('não considera aberto quando status ou prazo impedem inscrição', ({ status, startsAt, deadline }) => {
    expect(isRegistrationOpen({
      status,
      startsAt: new Date(`${startsAt}T12:00:00.000Z`),
      registrationDeadline: new Date(`${deadline}T12:00:00.000Z`),
    }, now)).toBe(false);
  });
});

describe('gestão de evento existente', () => {
  it('exige events.update antes de editar', () => {
    const update = vi.fn();
    const useCase = new UpdateEventUseCase({ update } as unknown as EventRepository);
    expect(() => useCase.execute(principal([]), '20000000-0000-4000-8000-000000000001', editableEvent)).toThrow(AuthorizationError);
    expect(update).not.toHaveBeenCalled();
  });

  it('edita dados sem alterar o status de publicação', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'event' });
    const useCase = new UpdateEventUseCase({ update } as unknown as EventRepository);
    await useCase.execute(principal(['events.update']), '20000000-0000-4000-8000-000000000001', editableEvent);
    const draft = update.mock.calls[0]![2];
    expect(draft.props.publish).toBe(false);
  });

  it('exige events.publish para cancelar', async () => {
    const cancel = vi.fn();
    const useCase = new CancelEventUseCase({ cancel } as unknown as EventRepository);
    await expect(useCase.execute(principal([]), '20000000-0000-4000-8000-000000000001')).rejects.toThrow(AuthorizationError);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('ciclo de vida do evento', () => {
  it('permite fechar inscrições apenas após publicação', () => {
    expect(canTransitionEvent('published', 'close_registrations')).toBe(true);
    expect(canTransitionEvent('draft', 'close_registrations')).toBe(false);
  });

  it('não permite cancelar um evento concluído', () => {
    expect(canTransitionEvent('completed', 'cancel')).toBe(false);
    expect(canTransitionEvent('registration_closed', 'cancel')).toBe(true);
  });
});
