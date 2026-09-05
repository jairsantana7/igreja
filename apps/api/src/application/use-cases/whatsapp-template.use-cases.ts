import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { WhatsAppTemplateProvider, WhatsAppTemplateRepository } from '../ports/whatsapp-template.port';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

export class ListWhatsAppTemplatesUseCase {
  constructor(private readonly templates: WhatsAppTemplateRepository) {}
  async execute(principal: AuthenticatedPrincipal, channelId: string) {
    if (!principal.permissions.includes(PERMISSIONS.whatsappTemplatesRead)) throw new AuthorizationError('Você não tem permissão para visualizar templates do WhatsApp.');
    const templates = await this.templates.list(principal, channelId);
    if (!templates) throw new NotFoundError('Canal não encontrado ou sem acesso.');
    return templates;
  }
}

export class SyncWhatsAppTemplatesUseCase {
  constructor(private readonly templates: WhatsAppTemplateRepository, private readonly provider: WhatsAppTemplateProvider) {}
  async execute(principal: AuthenticatedPrincipal, channelId: string) {
    if (!principal.permissions.includes(PERMISSIONS.whatsappTemplatesSync)) throw new AuthorizationError('Você não tem permissão para sincronizar templates do WhatsApp.');
    const channel = await this.templates.findChannel(principal, channelId);
    if (!channel) throw new NotFoundError('Canal não encontrado ou sem acesso.');
    if (channel.providerKey !== this.provider.providerKey) throw new ConflictError('O canal não utiliza um provedor compatível com este sincronizador.');
    let remote: Awaited<ReturnType<WhatsAppTemplateProvider['list']>>;
    try {
      remote = await this.provider.list(channel);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ConflictError) throw error;
      throw new ConflictError('A Meta não confirmou a sincronização. Verifique o WABA ID, o segredo e a versão da Graph API.');
    }
    const synchronized = await this.templates.synchronize(principal, channelId, remote);
    if (!synchronized) throw new NotFoundError('Canal não encontrado ou sem acesso.');
    return synchronized;
  }
}
