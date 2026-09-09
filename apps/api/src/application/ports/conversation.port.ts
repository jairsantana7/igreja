import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { ChannelConnectionStatus, ConversationChannelConfiguration, ConversationReactionEmoji, ConversationStatus, OutboundConversationMessage } from '../../domain/entities/conversation';
import type { StoredMedia } from './media-storage.port';

export interface ConversationChannelView {
  id: string;
  owner: { id: string; name: string };
  providerKey: string;
  displayName: string;
  phoneNumber: string;
  providerAccountId: string;
  secretReference: string | null;
  status: ChannelConnectionStatus;
}

export interface ConversationChannelConnectionView {
  channelId: string;
  providerKey: string;
  status: ChannelConnectionStatus;
  qrCode: string | null;
  qrExpiresAt: string | null;
  failureCode: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
}

export interface ConversationSummaryView {
  id: string;
  channel: Pick<ConversationChannelView, 'id' | 'displayName' | 'phoneNumber'>;
  assignedTo: { id: string; name: string };
  event: { id: string; title: string } | null;
  member: { id: string; name: string } | null;
  contact: { name: string; address: string };
  status: ConversationStatus;
  lastMessage: string | null;
  lastMessageAt: string;
}

export interface ConversationMessageView {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: 'received' | 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  sentBy: string | null;
  createdAt: string;
  attachments: ConversationMessageAttachmentView[];
  quotedMessage: { id: string; direction: 'inbound' | 'outbound'; body: string } | null;
  reactions: Array<{ actor: 'channel' | 'contact'; emoji: string }>;
}

export interface ConversationMessageAttachmentView {
  id: string;
  kind: 'image' | 'audio';
  mimeType: StoredMedia['mimeType'];
  byteSize: number;
  durationSeconds: number | null;
}

export interface ConversationAttachmentSource extends StoredMedia {}

export interface ConversationRepository {
  listChannels(principal: AuthenticatedPrincipal): Promise<ConversationChannelView[]>;
  createChannel(principal: AuthenticatedPrincipal, ownerUserId: string, config: ConversationChannelConfiguration): Promise<ConversationChannelView>;
  list(principal: AuthenticatedPrincipal): Promise<ConversationSummaryView[]>;
  findForMember(principal: AuthenticatedPrincipal, memberUserId: string): Promise<ConversationSummaryView | null>;
  create(principal: AuthenticatedPrincipal, input: { channelId: string; eventId?: string; memberUserId?: string; contactName: string; contactAddress: string }): Promise<ConversationSummaryView | null>;
  messages(principal: AuthenticatedPrincipal, conversationId: string): Promise<ConversationMessageView[] | null>;
  historySyncTarget(principal: AuthenticatedPrincipal, conversationId: string): Promise<{ providerKey: string } | null>;
  messageActionTarget(principal: AuthenticatedPrincipal, conversationId: string, messageId: string): Promise<{ providerKey: string } | null>;
  resolveAttachment(principal: AuthenticatedPrincipal, conversationId: string, attachmentId: string): Promise<ConversationAttachmentSource | null>;
  addOutbound(principal: AuthenticatedPrincipal, conversationId: string, message: OutboundConversationMessage, replyToMessageId?: string): Promise<ConversationMessageView | null>;
  addOutboundMedia(principal: AuthenticatedPrincipal, conversationId: string, input: { body: string; attachment: ConversationIncomingAttachment; replyToMessageId?: string }): Promise<ConversationMessageView | null>;
  markQueued(principal: AuthenticatedPrincipal, conversationId: string, messageId: string, jobId: string): Promise<ConversationMessageView | null>;
  updateStatus(principal: AuthenticatedPrincipal, conversationId: string, status: ConversationStatus): Promise<ConversationSummaryView | null>;
  connection(principal: AuthenticatedPrincipal, channelId: string): Promise<ConversationChannelConnectionView | null>;
  markConnectionRequested(principal: AuthenticatedPrincipal, channelId: string): Promise<boolean>;
  markDisconnectionRequested(principal: AuthenticatedPrincipal, channelId: string): Promise<boolean>;
  markConnectionCommandFailed(principal: AuthenticatedPrincipal, channelId: string, failureCode: string): Promise<void>;
  deleteChannel(principal: AuthenticatedPrincipal, channelId: string): Promise<'deleted' | 'not_found' | 'connected' | 'has_conversations' | 'has_reminders'>;
}

export interface ConversationRuntimeChannel {
  id: string;
  tenantId: string;
  providerKey: string;
  phoneNumber: string;
  ownerUserId: string;
}

export interface ConversationOutboundDelivery {
  channel: ConversationRuntimeChannel;
  conversationId: string;
  messageId: string;
  recipient: string;
  body: string;
  attachment?: ConversationAttachmentSource & { mediaKind: 'image' | 'audio' };
  quotedMessage?: ConversationProviderMessageReference;
}

export interface ConversationProviderMessageReference {
  providerMessageId: string;
  direction: 'inbound' | 'outbound';
  body: string;
}

export interface ConversationReactionDelivery {
  channel: ConversationRuntimeChannel;
  conversationId: string;
  messageId: string;
  recipient: string;
  target: ConversationProviderMessageReference;
  emoji: ConversationReactionEmoji | null;
}

export interface ConversationHistorySync {
  channel: ConversationRuntimeChannel;
  conversationId: string;
  recipient: string;
  oldestMessage: {
    providerMessageId: string;
    direction: 'inbound' | 'outbound';
    createdAt: Date;
  };
}

export interface ConversationRuntimeRepository {
  listRestorableChannels(): Promise<Array<{ tenantId: string; channelId: string }>>;
  findChannel(tenantId: string, channelId: string): Promise<ConversationRuntimeChannel | null>;
  findOutbound(tenantId: string, conversationId: string, messageId: string): Promise<ConversationOutboundDelivery | null>;
  findHistorySync(tenantId: string, conversationId: string): Promise<ConversationHistorySync | null>;
  findReactionDelivery(tenantId: string, conversationId: string, messageId: string, emoji: ConversationReactionEmoji | null): Promise<ConversationReactionDelivery | null>;
  updateConnection(tenantId: string, channelId: string, update: {
    status: ChannelConnectionStatus;
    failureCode?: string | null;
    qrExpiresAt?: Date | null;
  }): Promise<void>;
  receiveInbound(input: {
    tenantId: string;
    channelId: string;
    providerMessageId: string;
    contactName: string;
    contactAddress: string;
    contactAddressAliases?: string[];
    body: string;
    attachment?: ConversationIncomingAttachment;
    quotedProviderMessageId?: string;
    receivedAt: Date;
  }): Promise<boolean>;
  receiveOutboundMirror(input: {
    tenantId: string;
    channelId: string;
    providerMessageId: string;
    contactName: string;
    contactAddress: string;
    contactAddressAliases?: string[];
    body: string;
    attachment?: ConversationIncomingAttachment;
    quotedProviderMessageId?: string;
    sentAt: Date;
  }): Promise<boolean>;
  ensureConversation(input: {
    tenantId: string;
    channelId: string;
    contactName: string;
    contactAddress: string;
    contactAddressAliases?: string[];
    lastActivityAt: Date;
  }): Promise<void>;
  applyReaction(input: {
    tenantId: string;
    channelId: string;
    targetProviderMessageId: string;
    actor: 'channel' | 'contact';
    emoji: string | null;
    createdByUserId?: string;
  }): Promise<void>;
  listUnresolvedContacts(tenantId: string, channelId: string): Promise<Array<{ conversationId: string; contactAddress: string }>>;
  resolveContactAddress(tenantId: string, channelId: string, conversationId: string, contactAddress: string): Promise<void>;
  markOutboundSent(tenantId: string, conversationId: string, messageId: string, providerMessageId: string): Promise<void>;
  markOutboundFailed(tenantId: string, conversationId: string, messageId: string): Promise<void>;
  updateOutboundDelivery(tenantId: string, channelId: string, providerMessageId: string, status: 'sent' | 'delivered' | 'read'): Promise<void>;
}

export interface ConversationIncomingAttachment extends StoredMedia {
  mediaKind: 'image' | 'audio';
  byteSize: number;
  durationSeconds?: number;
}

export interface ConversationProvider {
  readonly providerKey: string;
  connect(channel: ConversationRuntimeChannel): Promise<void>;
  disconnect(channel: ConversationRuntimeChannel): Promise<void>;
  send(input: ConversationOutboundDelivery & { idempotencyKey: string }): Promise<{ providerMessageId: string }>;
  react(input: ConversationReactionDelivery): Promise<void>;
  syncHistory(input: ConversationHistorySync): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ConversationProviderResolver {
  resolve(providerKey: string): ConversationProvider | null;
}

export interface ConversationProviderCatalog {
  supportsConnection(providerKey: string): boolean;
}

export interface ConversationProviderStateStore {
  get(tenantId: string, channelId: string, providerKey: string, stateKey: string): Promise<string | null>;
  set(input: { tenantId: string; channelId: string; providerKey: string; stateKey: string; value: string; expiresAt?: Date }): Promise<void>;
  remove(tenantId: string, channelId: string, providerKey: string, stateKey: string): Promise<void>;
  clear(tenantId: string, channelId: string, providerKey: string): Promise<void>;
}

export interface SensitiveStateCipher {
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}
