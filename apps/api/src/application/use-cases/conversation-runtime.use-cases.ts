import type {
  ConversationProviderResolver,
  ConversationRuntimeRepository,
} from '../ports/conversation.port';
import { NotFoundError } from './errors';

export class ConnectConversationChannelJobUseCase {
  constructor(
    private readonly conversations: ConversationRuntimeRepository,
    private readonly providers: ConversationProviderResolver,
  ) {}

  async execute(tenantId: string, channelId: string): Promise<void> {
    const channel = await this.conversations.findChannel(tenantId, channelId);
    if (!channel) throw new NotFoundError('Canal não encontrado.');
    const provider = this.providers.resolve(channel.providerKey);
    if (!provider) throw new Error(`Nenhum adapter foi configurado para ${channel.providerKey}.`);
    await provider.connect(channel);
  }
}

export class DisconnectConversationChannelJobUseCase {
  constructor(
    private readonly conversations: ConversationRuntimeRepository,
    private readonly providers: ConversationProviderResolver,
  ) {}

  async execute(tenantId: string, channelId: string): Promise<void> {
    const channel = await this.conversations.findChannel(tenantId, channelId);
    if (!channel) throw new NotFoundError('Canal não encontrado.');
    const provider = this.providers.resolve(channel.providerKey);
    if (!provider) throw new Error(`Nenhum adapter foi configurado para ${channel.providerKey}.`);
    await provider.disconnect(channel);
  }
}

export class DispatchConversationMessageJobUseCase {
  constructor(
    private readonly conversations: ConversationRuntimeRepository,
    private readonly providers: ConversationProviderResolver,
  ) {}

  async execute(tenantId: string, conversationId: string, messageId: string): Promise<void> {
    const delivery = await this.conversations.findOutbound(tenantId, conversationId, messageId);
    if (!delivery) return;
    const provider = this.providers.resolve(delivery.channel.providerKey);
    if (!provider) throw new Error(`Nenhum adapter foi configurado para ${delivery.channel.providerKey}.`);
    const sent = await provider.send({ ...delivery, idempotencyKey: messageId });
    await this.conversations.markOutboundSent(tenantId, conversationId, messageId, sent.providerMessageId);
  }
}

export class SyncConversationHistoryJobUseCase {
  constructor(
    private readonly conversations: ConversationRuntimeRepository,
    private readonly providers: ConversationProviderResolver,
  ) {}

  async execute(tenantId: string, conversationId: string): Promise<void> {
    const target = await this.conversations.findHistorySync(tenantId, conversationId);
    if (!target) return;
    const provider = this.providers.resolve(target.channel.providerKey);
    if (!provider) throw new Error(`Nenhum adapter foi configurado para ${target.channel.providerKey}.`);
    await provider.syncHistory(target);
  }
}
