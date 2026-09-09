export type ConversationRealtimeResource = 'conversations' | 'channels';

export interface ConversationRealtimeBus {
  publish(tenantId: string, resource: ConversationRealtimeResource): Promise<void>;
  subscribe(tenantId: string, listener: (resource: ConversationRealtimeResource) => void): () => void;
  close(): Promise<void>;
}
