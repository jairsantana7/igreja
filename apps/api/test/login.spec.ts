import { describe, expect, it, vi } from 'vitest';
import { LoginUseCase } from '../src/application/use-cases/login.use-case';

const identity = {
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Membro',
  email: 'membro@example.test',
  passwordHash: 'hash',
  roles: ['member'],
  permissions: ['events.register'],
};

function setup() {
  const authentication = {
    findForLogin: vi.fn().mockResolvedValue(identity),
    findForTenantLogin: vi.fn().mockResolvedValue(identity),
  };
  const useCase = new LoginUseCase(
    authentication as any,
    { verify: vi.fn().mockResolvedValue(true) } as any,
    { sign: vi.fn().mockResolvedValue('token') } as any,
    { create: vi.fn().mockResolvedValue('session') } as any,
    { issue: vi.fn().mockReturnValue({ proof: 'proof', proofHash: 'proof-hash', userAgentHash: 'agent-hash' }) } as any,
  );
  return { authentication, useCase };
}

describe('identificador de login', () => {
  it('normaliza um celular brasileiro com ou sem máscara', async () => {
    const { authentication, useCase } = setup();
    await useCase.execute({ tenantSlug: 'comunidade', identifier: '(13) 99999-0002', password: 'senha-segura' }, { userAgent: 'teste' });
    expect(authentication.findForLogin).toHaveBeenCalledWith('comunidade', '+5513999990002');
  });

  it('normaliza o e-mail e também funciona no convite de evento', async () => {
    const { authentication, useCase } = setup();
    await useCase.executeForTenant({
      tenantId: identity.tenantId,
      identifier: '  MEMBRO@EXAMPLE.TEST  ',
      password: 'senha-segura',
    }, { userAgent: 'teste' });
    expect(authentication.findForTenantLogin).toHaveBeenCalledWith(identity.tenantId, 'membro@example.test');
  });
});
