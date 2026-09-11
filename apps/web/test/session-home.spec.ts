import { describe, expect, it } from 'vitest';
import { sessionHomePath } from '../app/utils/session-home';

describe('sessionHomePath', () => {
  it('leva membros ao portal de eventos', () => {
    expect(sessionHomePath({ permissions: ['events.register', 'events.member_portal_read'] })).toBe('/my-events');
  });

  it('prioriza a gestão para quem pode ler eventos administrativos', () => {
    expect(sessionHomePath({ permissions: ['events.member_portal_read', 'events.read'] })).toBe('/dashboard');
  });

  it('usa uma área autorizada e trata contas sem funcionalidades', () => {
    expect(sessionHomePath({ permissions: ['conversations.read'] })).toBe('/conversations');
    expect(sessionHomePath({ permissions: [] })).toBe('/no-access');
  });
});
