import { ConversationChannelConfiguration, OutboundConversationMessage, type ConversationStatus } from '../../domain/entities/conversation';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import type { ConversationProviderCatalog, ConversationRepository } from '../ports/conversation.port';
import type { JobQueue } from '../ports/job-queue.port';
import type { MemberOnboardingRepository } from '../ports/member-onboarding.port';
import type { PasswordHasher } from '../ports/authentication.port';
import type { MediaStorage } from '../ports/media-storage.port';
import { DomainError } from '../../domain/entities/errors';
import {
  canonicalConversationMimeType,
  conversationMediaKind,
  conversationMediaSizeLimit,
  matchesConversationMediaSignature,
} from '../services/conversation-media.policy';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission) {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError('Você não tem permissão para realizar esta ação.');
}

function requireChannelManagement(principal: AuthenticatedPrincipal) {
  if (!principal.permissions.includes(PERMISSIONS.channelsManageOwn) && !principal.permissions.includes(PERMISSIONS.channelsManageAll)) {
    throw new AuthorizationError('Você não tem permissão para administrar canais.');
  }
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

export class GetConversationChannelConnectionUseCase {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute(principal: AuthenticatedPrincipal, channelId: string) {
    requireChannelManagement(principal);
    const connection = await this.conversations.connection(principal, channelId);
    if (!connection) throw new NotFoundError('Canal não encontrado ou sem acesso.');
    return connection;
  }
}

export class ConnectConversationChannelUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly queue: JobQueue,
    private readonly providers: ConversationProviderCatalog,
  ) {}

  async execute(principal: AuthenticatedPrincipal, channelId: string) {
    requireChannelManagement(principal);
    const connection = await this.conversations.connection(principal, channelId);
    if (!connection) throw new NotFoundError('Canal não encontrado ou sem acesso.');
    if (!this.providers.supportsConnection(connection.providerKey)) {
      throw new ConflictError('A instalação não possui um conector habilitado para este canal.');
    }
    await this.conversations.markConnectionRequested(principal, channelId);
    try {
      await this.queue.enqueue({
        name: 'conversations.channel.connect',
        payload: { tenantId: principal.tenantId, channelId },
        deduplicationKey: `${channelId}:connect`,
      }, { attempts: 3 });
    } catch {
      await this.conversations.markConnectionCommandFailed(principal, channelId, 'queue_unavailable');
      throw new ConflictError('O worker de WhatsApp não está disponível para iniciar o pareamento.');
    }
    return this.conversations.connection(principal, channelId);
  }
}
export class DisconnectConversationChannelUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly queue: JobQueue,
    private readonly providers: ConversationProviderCatalog,
  ) {}

  async execute(principal: AuthenticatedPrincipal, channelId: string) {
    requireChannelManagement(principal);
    const connection = await this.conversations.connection(principal, channelId);
    if (!connection) throw new NotFoundError('Canal não encontrado ou sem acesso.');
    if (!this.providers.supportsConnection(connection.providerKey)) {
      throw new ConflictError('A instalação não possui um conector habilitado para este canal.');
    }
    await this.conversations.markDisconnectionRequested(principal, channelId);
    try {
      await this.queue.enqueue({
        name: 'conversations.channel.disconnect',
        payload: { tenantId: principal.tenantId, channelId },
        deduplicationKey: `${channelId}:disconnect`,
      }, { attempts: 1 });
    } catch {
      await this.conversations.markConnectionCommandFailed(principal, channelId, 'queue_unavailable');
      throw new ConflictError('O worker de WhatsApp não está disponível para desconectar o canal.');
    }
    return this.conversations.connection(principal, channelId);
  }
}

export class DeleteConversationChannelUseCase {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute(principal: AuthenticatedPrincipal, channelId: string): Promise<void> {
    requireChannelManagement(principal);
    const result = await this.conversations.deleteChannel(principal, channelId);
    if (result === 'not_found') throw new NotFoundError('Canal não encontrado ou sem acesso.');
    if (result === 'connected') throw new ConflictError('Desconecte o canal antes de excluí-lo.');
    if (result === 'has_conversations') throw new ConflictError('Este canal possui conversas e precisa ser preservado no histórico.');
    if (result === 'has_reminders') throw new ConflictError('Remova os lembretes vinculados aos eventos antes de excluir este canal.');
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

export class CreateMemberFromConversationUseCase {
  constructor(
    private readonly onboarding: MemberOnboardingRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async execute(principal: AuthenticatedPrincipal, conversationId: string, input: { email: string; password: string }) {
    requirePermission(principal, PERMISSIONS.conversationsRead);
    requirePermission(principal, PERMISSIONS.usersCreate);
    requirePermission(principal, PERMISSIONS.memberProfilesManage);
    const member = await this.onboarding.createFromConversation(principal, {
      conversationId,
      email: input.email.toLowerCase().trim(),
      passwordHash: await this.passwords.hash(input.password),
    });
    if (!member) throw new NotFoundError('Conversa não encontrada ou sem acesso.');
    return member;
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

export class RequestConversationHistorySyncUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly queue: JobQueue,
    private readonly providers: ConversationProviderCatalog,
  ) {}

  async execute(principal: AuthenticatedPrincipal, conversationId: string) {
    requirePermission(principal, PERMISSIONS.conversationsRead);
    const target = await this.conversations.historySyncTarget(principal, conversationId);
    if (!target) throw new NotFoundError('Conversa não encontrada ou sem acesso.');
    if (!this.providers.supportsConnection(target.providerKey)) {
      throw new ConflictError('O canal desta conversa não oferece sincronização de histórico.');
    }
    try {
      await this.queue.enqueue({
        name: 'conversations.history.sync',
        payload: { tenantId: principal.tenantId, conversationId },
        deduplicationKey: `${conversationId}:history`,
      }, { attempts: 3 });
    } catch {
      throw new ConflictError('O worker de WhatsApp não está disponível para sincronizar o histórico.');
    }
    return { status: 'queued' as const };
  }
}

export class GetConversationMediaUseCase {
  constructor(private readonly conversations: ConversationRepository, private readonly storage: MediaStorage) {}

  async execute(principal: AuthenticatedPrincipal, conversationId: string, mediaId: string) {
    requirePermission(principal, PERMISSIONS.conversationsRead);
    const media = await this.conversations.resolveAttachment(principal, conversationId, mediaId);
    if (!media) throw new NotFoundError('Mídia não encontrada ou sem acesso.');
    try {
      return { content: await this.storage.read(media.storageKey), mimeType: media.mimeType };
    } catch {
      throw new NotFoundError('O arquivo desta mídia não está disponível.');
    }
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

export class SendConversationMediaUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly storage: MediaStorage,
    private readonly queue: JobQueue,
  ) {}

  async execute(principal: AuthenticatedPrincipal, conversationId: string, input: { content: Buffer; mimeType: string; caption?: string }) {
    requirePermission(principal, PERMISSIONS.conversationsReply);
    const mimeType = canonicalConversationMimeType(input.mimeType);
    if (!mimeType) throw new DomainError('O anexo deve ser uma imagem JPEG, PNG ou WebP, ou um áudio OGG, MP3, M4A ou AAC.');
    const mediaKind = conversationMediaKind(mimeType);
    if (input.content.length === 0) throw new DomainError('O arquivo enviado está vazio.');
    if (input.content.length > conversationMediaSizeLimit(mediaKind)) {
      throw new DomainError(mediaKind === 'image' ? 'A imagem deve ter no máximo 10 MiB.' : 'O áudio deve ter no máximo 20 MiB.');
    }
    if (!matchesConversationMediaSignature(input.content, mimeType)) {
      throw new DomainError('O conteúdo do arquivo não corresponde ao formato informado.');
    }

    const caption = input.caption?.trim().slice(0, 4_000) ?? '';
    const body = mediaKind === 'image' && caption ? caption : mediaKind === 'image' ? 'Imagem' : 'Áudio';
    const stored = await this.storage.save({ content: input.content, mimeType });
    let message;
    try {
      message = await this.conversations.addOutboundMedia(principal, conversationId, {
        body,
        attachment: { ...stored, mediaKind, byteSize: input.content.length },
      });
    } catch (error) {
      await this.storage.delete(stored.storageKey).catch(() => undefined);
      throw error;
    }
    if (!message) {
      await this.storage.delete(stored.storageKey).catch(() => undefined);
      throw new NotFoundError('Conversa não encontrada ou sem acesso.');
    }
    try {
      const job = await this.queue.enqueue({
        name: 'conversations.message.dispatch',
        payload: { tenantId: principal.tenantId, conversationId, messageId: message.id },
        deduplicationKey: message.id,
      }, { attempts: 5 });
      return await this.conversations.markQueued(principal, conversationId, message.id, job.jobId);
    } catch {
      throw new ConflictError('A fila de mensagens não está disponível. O anexo foi preservado como pendente.');
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
