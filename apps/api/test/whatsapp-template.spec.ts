import { describe, expect, it, vi } from 'vitest';
import { MetaWhatsAppTemplateProvider } from '../src/infrastructure/integrations/meta-whatsapp-template.provider';
import type { SecretResolver } from '../src/application/ports/secret-resolver.port';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import type { WhatsAppTemplateRepository } from '../src/application/ports/whatsapp-template.port';
import { ListWhatsAppTemplatesUseCase, SyncWhatsAppTemplatesUseCase } from '../src/application/use-cases/whatsapp-template.use-cases';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Pastor', email: 'pastor@example.test', roles: ['pastor'], permissions,
});
const channel = { id: 'channel', providerKey: 'whatsapp_cloud', providerAccountId: '1234567890', secretReference: 'META_TEST_TOKEN' };

describe('templates oficiais do WhatsApp', () => {
  it('percorre a paginação da Meta sem seguir URL externa', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '1', name: 'lembrete', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED', components: [] }], paging: { next: 'https://outro.invalid', cursors: { after: 'cursor-meta' } } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '2', name: 'boas_vindas', language: 'pt_BR', category: 'MARKETING', status: 'PENDING', components: [] }] }) });
    const secrets = { resolve: vi.fn().mockReturnValue('token-secreto') } as unknown as SecretResolver;
    const provider = new MetaWhatsAppTemplateProvider(secrets, 'v99.0', fetcher);
    const templates = await provider.list(channel);
    expect(templates.map((item) => item.props.status)).toEqual(['APPROVED', 'PENDING']);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![0]).toContain('graph.facebook.com/v99.0/1234567890/message_templates');
    expect(fetcher.mock.calls[1]![0]).toContain('after=cursor-meta');
    expect(fetcher.mock.calls[1]![0]).not.toContain('outro.invalid');
  });

  it('não consulta o segredo quando a configuração do canal é inválida', async () => {
    const resolve = vi.fn();
    const provider = new MetaWhatsAppTemplateProvider({ resolve } as unknown as SecretResolver, 'v99.0', vi.fn());
    await expect(provider.list({ ...channel, providerAccountId: 'inválido' })).rejects.toThrow('WABA');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('exige permissões distintas para leitura e sincronização', async () => {
    const repository = { list: vi.fn(), findChannel: vi.fn(), synchronize: vi.fn() } as unknown as WhatsAppTemplateRepository;
    const provider = { providerKey: 'whatsapp_cloud', list: vi.fn() };
    await expect(new ListWhatsAppTemplatesUseCase(repository).execute(principal([]), 'channel')).rejects.toThrow('permissão');
    await expect(new SyncWhatsAppTemplatesUseCase(repository, provider).execute(principal([]), 'channel')).rejects.toThrow('permissão');
    expect(repository.list).not.toHaveBeenCalled();
    expect(provider.list).not.toHaveBeenCalled();
  });
});
