import { describe, expect, it, vi } from 'vitest';
import type { PasswordHasher } from '../src/application/ports/authentication.port';
import type { MemberOnboardingRepository } from '../src/application/ports/member-onboarding.port';
import type { MemberOnboardingSecurity } from '../src/application/ports/member-onboarding-security.port';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import {
  CompletePublicMemberOnboardingUseCase,
  ListMemberOnboardingDeliveriesUseCase,
  RevealMemberOnboardingDeliveryUseCase,
} from '../src/application/use-cases/member-onboarding.use-cases';
import { AuthorizationError } from '../src/application/use-cases/errors';
import { NodeMemberOnboardingSecurity } from '../src/infrastructure/security/node-member-onboarding.security';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Admin', email: 'admin@example.test', roles: ['admin'], permissions,
});

describe('entrega de acesso do membro', () => {
  it('gera uma frase-senha legível e mantém token e payload protegidos', () => {
    const security = new NodeMemberOnboardingSecurity('segredo-de-teste-com-mais-de-trinta-e-dois-caracteres');
    const generated = security.generate();
    expect(generated.temporaryPassword).toMatch(/^[A-Z][a-z]+(?:-[A-Z][a-z]+){3}-\d{4}$/);
    expect(generated.invitationToken).toHaveLength(43);
    expect(generated.tokenHash).toBe(security.hashToken(generated.invitationToken));
    expect(generated.encryptedPayload.toString('utf8')).not.toContain(generated.temporaryPassword);
    expect(security.reveal(generated.encryptedPayload)).toEqual({
      temporaryPassword: generated.temporaryPassword,
      invitationToken: generated.invitationToken,
    });
  });

  it('exige permissão granular antes de listar a fila', async () => {
    const listDeliveries = vi.fn();
    const useCase = new ListMemberOnboardingDeliveriesUseCase({ listDeliveries } as unknown as MemberOnboardingRepository);
    expect(() => useCase.execute(principal([]))).toThrow(AuthorizationError);
    expect(listDeliveries).not.toHaveBeenCalled();
  });

  it('revela a senha somente pela porta criptográfica e registra a consulta', async () => {
    const encryptedPayload = Buffer.from('ciphertext');
    const onboarding = {
      findDeliverySecret: vi.fn().mockResolvedValue({ status: 'pending', expiresAt: new Date(Date.now() + 60_000), encryptedPayload }),
      markDeliveryRevealed: vi.fn().mockResolvedValue({ id: 'delivery' }),
    };
    const security = {
      reveal: vi.fn().mockReturnValue({ temporaryPassword: 'Casa-Rio-Luz-Paz-1234', invitationToken: 'token' }),
    };
    const useCase = new RevealMemberOnboardingDeliveryUseCase(
      onboarding as unknown as MemberOnboardingRepository,
      security as unknown as MemberOnboardingSecurity,
    );
    await expect(useCase.execute(principal(['members.credentials_manage']), 'delivery')).resolves.toEqual({
      temporaryPassword: 'Casa-Rio-Luz-Paz-1234',
      registrationPath: '/cadastro/delivery#token',
    });
    expect(security.reveal).toHaveBeenCalledWith(encryptedPayload);
    expect(onboarding.markDeliveryRevealed).toHaveBeenCalledWith(expect.any(Object), 'delivery');
  });

  it('conclui o perfil apenas após resolver o token e troca a senha temporária', async () => {
    const onboarding = {
      resolvePublicDelivery: vi.fn().mockResolvedValue({
        tenantId: '00000000-0000-4000-8000-000000000001', deliveryId: 'delivery',
        member: { id: '10000000-0000-4000-8000-000000000002', name: 'Pessoa', email: 'pessoa@example.test' },
        phone: '+5511999999999', expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      completePublicDelivery: vi.fn().mockResolvedValue(true),
    };
    const security = { hashToken: vi.fn().mockReturnValue('a'.repeat(64)) };
    const passwords = { hash: vi.fn().mockResolvedValue('new-hash') } as unknown as PasswordHasher;
    const useCase = new CompletePublicMemberOnboardingUseCase(
      onboarding as unknown as MemberOnboardingRepository,
      security as unknown as MemberOnboardingSecurity,
      passwords,
    );
    await expect(useCase.execute('delivery', 'token', {
      password: 'uma frase segura', birthDate: '1990-01-01', whatsappCommunicationOptIn: false,
    })).resolves.toEqual({ completed: true });
    expect(onboarding.completePublicDelivery).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '00000000-0000-4000-8000-000000000001',
      memberUserId: '10000000-0000-4000-8000-000000000002',
      tokenHash: 'a'.repeat(64), passwordHash: 'new-hash',
      profile: expect.objectContaining({ props: expect.objectContaining({ phone: '+5511999999999' }) }),
    }));
  });
});
