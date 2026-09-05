import { ConversationChannelConfiguration, OutboundConversationMessage, type ConversationStatus } from '../../domain/entities/conversation';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import type { ConversationRepository } from '../ports/conversation.port';
import type { JobQueue } from '../ports/job-queue.port';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission) {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError('Você não tem permissão para realizar esta ação.');
}

export class ListConversationChannelsUseCase {
  constructor(private readonly conversations: ConversationRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    if (!principal.permissions.includes(PERMISSIONS.channelsManageOwn) && !principal.permissions.includes(PERMISSIONS.channelsManageAll) && !principal.permissions.includes(PERMISSIONS.conversationsRead)) throw new AuthorizationError('Você não tem acesso aos canais.');
    return this.conversations.listChannels(principal);
  }
}

export class CreateConversationChannelUseCase {
  constructor(private readonly conversations: ConversationRepository) {}
  execute(principal: AuthenticatedPrincipal, input: { ownerUserId?: string; providerKey: string; displayName: string; phoneNumber: string; providerAccountId: string; secretReference?: string }) {
    const ownerUserId = input.ownerUserId ?? principal.userId;
    if (ownerUserId === principal.userId && !principal.permissions.includes(PERMISSIONS.channelsManageAll)) requirePermission(principal, PERMISSIONS.channelsManageOwn);
    else requirePermission(principal, PERMISSIONS.channelsManageAll);
    return this.conversations.createChannel(principal, ownerUserId, ConversationChannelConfiguration.create(input));
  }
}

export class ListConversationsUseCase {
  constructor(private readonly conversations: ConversationRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.conversationsRead);
    return this.conversations.list(principal);
  }
}

export class CreateConversationUseCase {
  constructor(private readonly conversations: ConversationRepository) {}
  async execute(principal: AuthenticatedPrincipal, input: { channelId: string; eventId?: string; memberUserId?: string; contactName: string; contactAddress: string }) {
    requirePermission(principal, PERMISSIONS.conversationsReply);
    const conversation = await this.conversations.create(principal, input);
    if (!conversation) throw new NotFoundError('Canal ou vínculo não encontrado para esta comunidade.');
    return conversation;
  }
}

export class GetConversationMessagesUseCase {
  constructor(private readonly conversations: ConversationRepository) {}
  async execute(principal: AuthenticatedPrincipal, conversationId: string) {
    requirePermission(principal, PERMISSIONS.conversationsRead);
    const messages = await this.conversations.messages(principal, conversationId);
    if (!messages) throw new NotFoundError('Conversa não encontrada ou sem acesso.');
    return messages;
  }
}

export class ReplyConversationUseCase {
  constructor(private readonly conversations: ConversationRepository, private readonly queue: JobQueue) {}
  async execute(principal: AuthenticatedPrincipal, conversationId: string, body: string) {
    requirePermission(principal, PERMISSIONS.conversationsReply);
    const message = await this.conversations.addOutbound(principal, conversationId, OutboundConversationMessage.create(body));
    if (!message) throw new NotFoundError('Conversa não encontrada ou sem acesso.');
    try {
      const job = await this.queue.enqueue({
        name: 'conversations.message.dispatch',
        payload: { tenantId: principal.tenantId, conversationId, messageId: message.id },
        deduplicationKey: message.id,
      }, { attempts: 5 });
      return await this.conversations.markQueued(principal, conversationId, message.id, job.jobId);
    } catch {
      throw new ConflictError('A fila de mensagens não está disponível. A resposta foi preservada como pendente.');
    }
  }
}

export class UpdateConversationStatusUseCase {
  constructor(private readonly conversations: ConversationRepository) {}
  async execute(principal: AuthenticatedPrincipal, conversationId: string, status: ConversationStatus) {
    requirePermission(principal, PERMISSIONS.conversationsAssign);
    const conversation = await this.conversations.updateStatus(principal, conversationId, status);
    if (!conversation) throw new NotFoundError('Conversa não encontrada ou sem acesso.');
    return conversation;
  }
}
