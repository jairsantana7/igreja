import { describe, expect, it, vi } from 'vitest';
import type { CommunitySettingsRepository } from '../src/application/ports/community-settings.port';
import type { CacheStore } from '../src/application/ports/cache-store.port';
import { UpdateCommunitySettingsUseCase } from '../src/application/use-cases/community-settings.use-cases';
import { AuthorizationError } from '../src/application/use-cases/errors';
import { CommunitySettings } from '../src/domain/entities/community-settings';
import { DomainError } from '../src/domain/entities/errors';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Admin',
  email: 'admin@example.test',
  roles: ['admin'],
  permissions,
});

const cache = (): CacheStore => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
});

describe('configurações da comunidade', () => {
  it('não permite habilitar provedor social sem Client ID e referência de segredo', () => {
    const input = structuredClone(CommunitySettings.defaults().props);
    input.socialLogin.google.enabled = true;
    expect(() => CommunitySettings.create(input)).toThrow(DomainError);
  });

  it('não permite persistir segredo no campo reservado à referência', () => {
    const input = structuredClone(CommunitySettings.defaults().props);
    input.socialLogin.google.secretReference = 'segredo-real';
    expect(() => CommunitySettings.create(input)).toThrow(DomainError);
  });

  it('verifica settings.manage antes de chamar o repositório', async () => {
    const save = vi.fn();
    const useCase = new UpdateCommunitySettingsUseCase({ save } as unknown as CommunitySettingsRepository, cache());
    await expect(useCase.execute(principal([]), CommunitySettings.defaults().props)).rejects.toThrow(AuthorizationError);
    expect(save).not.toHaveBeenCalled();
  });

  it('persiste configuração válida pela porta do repositório', async () => {
    const settings = CommunitySettings.defaults().props;
    settings.payments.pix = {
      enabled: true,
      keyType: 'email',
      key: 'recebimentos@example.test',
      recipientName: 'Comunidade Exemplo',
      city: 'São Paulo',
    };
    const save = vi.fn().mockResolvedValue(settings);
    const useCase = new UpdateCommunitySettingsUseCase({ save } as unknown as CommunitySettingsRepository, cache());
    await expect(useCase.execute(principal(['settings.manage']), settings)).resolves.toEqual(settings);
    expect(save).toHaveBeenCalledOnce();
  });
});
