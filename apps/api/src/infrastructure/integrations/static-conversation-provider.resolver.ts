import type { ConversationProvider, ConversationProviderResolver } from '../../application/ports/conversation.port';

export class StaticConversationProviderResolver implements ConversationProviderResolver {
  private readonly providers: ReadonlyMap<string, ConversationProvider>;

  constructor(providers: ConversationProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.providerKey, provider]));
  }

  resolve(providerKey: string): ConversationProvider | null {
    return this.providers.get(providerKey) ?? null;
  }
}
