import { describe, expect, it } from 'vitest';
import { isRegistrationOpen } from '../src/domain/entities/event';

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
