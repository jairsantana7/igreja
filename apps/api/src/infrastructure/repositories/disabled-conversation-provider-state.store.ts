import type { ConversationProviderStateStore } from '../../application/ports/conversation.port';

export class DisabledConversationProviderStateStore implements ConversationProviderStateStore {
  async get(): Promise<null> { return null; }
  async set(): Promise<never> { throw new Error('O armazenamento de sessão do conector está desabilitado.'); }
  async remove(): Promise<void> { return undefined; }
  async clear(): Promise<void> { return undefined; }
}
