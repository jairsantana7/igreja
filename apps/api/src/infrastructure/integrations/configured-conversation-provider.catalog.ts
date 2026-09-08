import type { ConversationProviderCatalog } from '../../application/ports/conversation.port';

export class ConfiguredConversationProviderCatalog implements ConversationProviderCatalog {
  constructor(private readonly whatsappWebDriver: 'disabled' | 'baileys') {}

  supportsConnection(providerKey: string): boolean {
    return providerKey === 'whatsapp_web' && this.whatsappWebDriver !== 'disabled';
  }
}
