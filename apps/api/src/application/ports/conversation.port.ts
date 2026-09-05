import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { ConversationChannelConfiguration, ConversationStatus, OutboundConversationMessage } from '../../domain/entities/conversation';

export interface ConversationChannelView {
  id: string;
  owner: { id: string; name: string };
  providerKey: string;
  displayName: string;
  phoneNumber: string;
  providerAccountId: string;
  secretReference: string | null;
  status: 'configured' | 'connected' | 'disconnected';
}

export interface ConversationSummaryView {
  id: string;
  channel: Pick<ConversationChannelView, 'id' | 'displayName' | 'phoneNumber'>;
  assignedTo: { id: string; name: string };
  event: { id: string; title: string } | null;
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
}

export interface ConversationRepository {
  listChannels(principal: AuthenticatedPrincipal): Promise<ConversationChannelView[]>;
  createChannel(principal: AuthenticatedPrincipal, ownerUserId: string, config: ConversationChannelConfiguration): Promise<ConversationChannelView>;
  list(principal: AuthenticatedPrincipal): Promise<ConversationSummaryView[]>;
  create(principal: AuthenticatedPrincipal, input: { channelId: string; eventId?: string; memberUserId?: string; contactName: string; contactAddress: string }): Promise<ConversationSummaryView | null>;
  messages(principal: AuthenticatedPrincipal, conversationId: string): Promise<ConversationMessageView[] | null>;
  addOutbound(principal: AuthenticatedPrincipal, conversationId: string, message: OutboundConversationMessage): Promise<ConversationMessageView | null>;
  markQueued(principal: AuthenticatedPrincipal, conversationId: string, messageId: string, jobId: string): Promise<ConversationMessageView | null>;
  updateStatus(principal: AuthenticatedPrincipal, conversationId: string, status: ConversationStatus): Promise<ConversationSummaryView | null>;
}

export interface ConversationProvider {
  readonly providerKey: string;
  send(input: { channelId: string; recipient: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
}
