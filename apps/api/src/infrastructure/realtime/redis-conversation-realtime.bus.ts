import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import type { ApplicationLogger } from '../../application/ports/application-logger.port';
import type { ConversationRealtimeBus, ConversationRealtimeResource } from '../../application/ports/conversation-realtime.port';

const CHANNEL = 'igreja:conversation-realtime:v1';
const RESOURCES: ConversationRealtimeResource[] = ['conversations', 'channels'];

@Injectable()
export class RedisConversationRealtimeBus implements ConversationRealtimeBus, OnModuleDestroy {
  private readonly publisher: IORedis;
  private readonly subscriber: IORedis;
  private readonly listeners = new Map<string, Set<(resource: ConversationRealtimeResource) => void>>();

  constructor(redisUrl: string, private readonly logger: ApplicationLogger) {
    this.publisher = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
    this.subscriber = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.publisher.on('error', () => undefined);
    this.subscriber.on('error', () => undefined);
    this.subscriber.on('message', (_channel, payload) => this.dispatch(payload));
    void this.subscriber.subscribe(CHANNEL).catch((error) => {
      this.logger.warn('conversation_realtime_subscribe_failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    });
  }

  async publish(tenantId: string, resource: ConversationRealtimeResource): Promise<void> {
    try {
      await this.publisher.publish(CHANNEL, JSON.stringify({ tenantId, resource }));
    } catch (error) {
      this.logger.warn('conversation_realtime_publish_failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    }
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
    await Promise.allSettled([this.subscriber.quit(), this.publisher.quit()]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private dispatch(payload: string): void {
    try {
      const event = JSON.parse(payload) as { tenantId?: unknown; resource?: unknown };
      if (typeof event.tenantId !== 'string' || !RESOURCES.includes(event.resource as ConversationRealtimeResource)) return;
      for (const listener of this.listeners.get(event.tenantId) ?? []) listener(event.resource as ConversationRealtimeResource);
    } catch {
      this.logger.warn('conversation_realtime_payload_invalid');
    }
  }
}
