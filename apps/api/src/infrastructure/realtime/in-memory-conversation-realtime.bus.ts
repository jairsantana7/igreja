import type { ConversationRealtimeBus, ConversationRealtimeResource } from '../../application/ports/conversation-realtime.port';

export class InMemoryConversationRealtimeBus implements ConversationRealtimeBus {
  private readonly listeners = new Map<string, Set<(resource: ConversationRealtimeResource) => void>>();

  async publish(tenantId: string, resource: ConversationRealtimeResource): Promise<void> {
    for (const listener of this.listeners.get(tenantId) ?? []) listener(resource);
  }

  subscribe(tenantId: string, listener: (resource: ConversationRealtimeResource) => void): () => void {
    const tenantListeners = this.listeners.get(tenantId) ?? new Set();
    tenantListeners.add(listener);
    this.listeners.set(tenantId, tenantListeners);
    return () => {
      tenantListeners.delete(listener);
      if (tenantListeners.size === 0) this.listeners.delete(tenantId);
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
  }
}
