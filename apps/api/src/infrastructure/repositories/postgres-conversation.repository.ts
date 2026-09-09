import type { PoolClient } from 'pg';
import type { ConversationChannelConnectionView, ConversationChannelView, ConversationMessageView, ConversationProviderStateStore, ConversationRepository, ConversationSummaryView } from '../../application/ports/conversation.port';
import type { ConversationChannelConfiguration, ConversationStatus, OutboundConversationMessage } from '../../domain/entities/conversation';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { ConflictError } from '../../application/use-cases/errors';
import { PostgresDatabase } from '../database/postgres.database';
import type { ConversationRealtimeBus, ConversationRealtimeResource } from '../../application/ports/conversation-realtime.port';

export class PostgresConversationRepository implements ConversationRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly providerState: ConversationProviderStateStore,
    private readonly realtime: ConversationRealtimeBus,
  ) {}

  listChannels(principal: AuthenticatedPrincipal): Promise<ConversationChannelView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        SELECT channels.*, users.name AS owner_name
        FROM conversation_channels AS channels
        JOIN users ON users.id = channels.owner_user_id AND users.tenant_id = channels.tenant_id
        WHERE $1::boolean OR channels.owner_user_id = $2
        ORDER BY channels.display_name
      `, [principal.permissions.includes('channels.manage_all') || principal.permissions.includes('conversations.read_all'), principal.userId]);
      return result.rows.map(this.mapChannel);
    });
  }

  createChannel(principal: AuthenticatedPrincipal, ownerUserId: string, config: ConversationChannelConfiguration): Promise<ConversationChannelView> {
    return this.withRealtime(principal.tenantId, 'channels', () => this.database.withTenant(principal, async (client) => {
      if (!(await client.query('SELECT 1 FROM users WHERE id = $1', [ownerUserId])).rowCount) throw new ConflictError('O responsável não pertence à comunidade.');
      try {
        const result = await client.query(`
          INSERT INTO conversation_channels (
            tenant_id, owner_user_id, provider_key, display_name, phone_number,
            provider_account_id, secret_reference, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'configured')
          RETURNING *
        `, [principal.tenantId, ownerUserId, config.props.providerKey, config.props.displayName, config.props.phoneNumber, config.props.providerAccountId, config.props.secretReference ?? null]);
        const owner = await client.query<{ name: string }>('SELECT name FROM users WHERE id = $1', [ownerUserId]);
        return this.mapChannel({ ...result.rows[0], owner_name: owner.rows[0]!.name });
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Este número já está configurado para o provedor.');
        throw error;
      }
    }));
  }

  list(principal: AuthenticatedPrincipal): Promise<ConversationSummaryView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(this.summarySql(`
        WHERE $1::boolean OR conversations.assigned_user_id = $2 OR channels.owner_user_id = $2
        ORDER BY conversations.last_message_at DESC
      `), [principal.permissions.includes('conversations.read_all'), principal.userId]);
      return result.rows.map(this.mapConversation);
    });
  }

  create(principal: AuthenticatedPrincipal, input: Parameters<ConversationRepository['create']>[1]): Promise<ConversationSummaryView | null> {
    return this.withRealtime(principal.tenantId, 'conversations', () => this.database.withTenant(principal, async (client) => {
      const channel = await client.query(`
        SELECT 1 FROM conversation_channels
        WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)
      `, [input.channelId, principal.permissions.includes('channels.manage_all') || principal.permissions.includes('conversations.read_all'), principal.userId]);
      if (!channel.rowCount) return null;
      if (input.eventId && !(await client.query('SELECT 1 FROM events WHERE id = $1', [input.eventId])).rowCount) return null;
      if (input.memberUserId && !(await client.query('SELECT 1 FROM users WHERE id = $1', [input.memberUserId])).rowCount) return null;
      const created = await client.query<{ id: string }>(`
        INSERT INTO conversations (
          tenant_id, channel_id, event_id, member_user_id, assigned_user_id, contact_name, contact_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [principal.tenantId, input.channelId, input.eventId ?? null, input.memberUserId ?? null, principal.userId, input.contactName.trim(), input.contactAddress.trim()]);
      return this.findSummary(client, principal, created.rows[0]!.id);
    }));
  }

  messages(principal: AuthenticatedPrincipal, conversationId: string): Promise<ConversationMessageView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      const result = await client.query(`
        SELECT messages.*, users.name AS sender_name,
          quoted.id AS quoted_id, quoted.direction AS quoted_direction, quoted.body AS quoted_body,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', attachments.id,
              'kind', attachments.media_kind,
              'mimeType', attachments.mime_type,
              'byteSize', attachments.byte_size,
              'durationSeconds', attachments.duration_seconds
            ) ORDER BY attachments.id)
            FROM conversation_message_attachments AS attachments
            WHERE attachments.message_id = messages.id
              AND attachments.conversation_id = messages.conversation_id
              AND attachments.tenant_id = messages.tenant_id
          ), '[]'::jsonb) AS attachments,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'actor', reactions.actor_kind,
              'emoji', reactions.emoji
            ) ORDER BY reactions.actor_kind)
            FROM conversation_message_reactions AS reactions
            WHERE reactions.message_id = messages.id
              AND reactions.conversation_id = messages.conversation_id
              AND reactions.tenant_id = messages.tenant_id
          ), '[]'::jsonb) AS reactions
        FROM conversation_messages AS messages
        LEFT JOIN users ON users.id = messages.sent_by_user_id AND users.tenant_id = messages.tenant_id
        LEFT JOIN conversation_messages AS quoted ON quoted.id = messages.quoted_message_id
          AND quoted.conversation_id = messages.conversation_id
          AND quoted.tenant_id = messages.tenant_id
        WHERE messages.conversation_id = $1
        ORDER BY messages.created_at, messages.id
      `, [conversationId]);
      return result.rows.map(this.mapMessage);
    });
  }

  historySyncTarget(principal: AuthenticatedPrincipal, conversationId: string): Promise<{ providerKey: string } | null> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<{ provider_key: string }>(`
        SELECT channels.provider_key
        FROM conversations
        JOIN conversation_channels AS channels
          ON channels.id = conversations.channel_id AND channels.tenant_id = conversations.tenant_id
        WHERE conversations.id = $1
          AND ($2::boolean OR conversations.assigned_user_id = $3 OR channels.owner_user_id = $3)
      `, [conversationId, principal.permissions.includes('conversations.read_all'), principal.userId]);
      return result.rows[0] ? { providerKey: result.rows[0].provider_key } : null;
    });
  }

  messageActionTarget(principal: AuthenticatedPrincipal, conversationId: string, messageId: string): Promise<{ providerKey: string } | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      const result = await client.query<{ provider_key: string }>(`
        SELECT channels.provider_key
        FROM conversation_messages AS messages
        JOIN conversations ON conversations.id = messages.conversation_id
          AND conversations.tenant_id = messages.tenant_id
        JOIN conversation_channels AS channels ON channels.id = conversations.channel_id
          AND channels.tenant_id = conversations.tenant_id
        WHERE messages.id = $1 AND conversations.id = $2
          AND messages.provider_message_id IS NOT NULL
      `, [messageId, conversationId]);
      return result.rows[0] ? { providerKey: result.rows[0].provider_key } : null;
    });
  }

  resolveAttachment(principal: AuthenticatedPrincipal, conversationId: string, attachmentId: string) {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        SELECT attachments.storage_key, attachments.mime_type
        FROM conversation_message_attachments AS attachments
        JOIN conversations ON conversations.id = attachments.conversation_id
          AND conversations.tenant_id = attachments.tenant_id
        JOIN conversation_channels AS channels ON channels.id = conversations.channel_id
          AND channels.tenant_id = conversations.tenant_id
        WHERE attachments.id = $1 AND attachments.conversation_id = $2
          AND ($3::boolean OR conversations.assigned_user_id = $4 OR channels.owner_user_id = $4)
      `, [attachmentId, conversationId, principal.permissions.includes('conversations.read_all'), principal.userId]);
      const attachment = result.rows[0];
      return attachment ? { storageKey: attachment.storage_key, mimeType: attachment.mime_type } : null;
    });
  }

  addOutbound(principal: AuthenticatedPrincipal, conversationId: string, message: OutboundConversationMessage, replyToMessageId?: string): Promise<ConversationMessageView | null> {
    return this.withRealtime(principal.tenantId, 'conversations', () => this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      if (replyToMessageId && !(await client.query(
        'SELECT 1 FROM conversation_messages WHERE id = $1 AND conversation_id = $2 AND provider_message_id IS NOT NULL',
        [replyToMessageId, conversationId],
      )).rowCount) return null;
      const result = await client.query(`
        INSERT INTO conversation_messages (
          tenant_id, conversation_id, sent_by_user_id, direction, body, status, quoted_message_id
        )
        VALUES ($1, $2, $3, 'outbound', $4, 'pending', $5)
        RETURNING *
      `, [principal.tenantId, conversationId, principal.userId, message.body, replyToMessageId ?? null]);
      await client.query('UPDATE conversations SET last_message_at = now(), updated_at = now(), status = $2 WHERE id = $1', [conversationId, 'waiting']);
      const quoted = replyToMessageId
        ? await client.query('SELECT id AS quoted_id, direction AS quoted_direction, body AS quoted_body FROM conversation_messages WHERE id = $1', [replyToMessageId])
        : null;
      return this.mapMessage({ ...result.rows[0], ...quoted?.rows[0], sender_name: principal.name });
    }));
  }

  addOutboundMedia(principal: AuthenticatedPrincipal, conversationId: string, input: Parameters<ConversationRepository['addOutboundMedia']>[2]): Promise<ConversationMessageView | null> {
    return this.withRealtime(principal.tenantId, 'conversations', () => this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      if (input.replyToMessageId && !(await client.query(
        'SELECT 1 FROM conversation_messages WHERE id = $1 AND conversation_id = $2 AND provider_message_id IS NOT NULL',
        [input.replyToMessageId, conversationId],
      )).rowCount) return null;
      const result = await client.query(`
        INSERT INTO conversation_messages (
          tenant_id, conversation_id, sent_by_user_id, direction, body, status, quoted_message_id
        )
        VALUES ($1, $2, $3, 'outbound', $4, 'pending', $5)
        RETURNING *
      `, [principal.tenantId, conversationId, principal.userId, input.body, input.replyToMessageId ?? null]);
      const message = result.rows[0];
      const attachment = await client.query(`
        INSERT INTO conversation_message_attachments (
          tenant_id, conversation_id, message_id, storage_key, media_kind,
          mime_type, byte_size, duration_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, media_kind AS kind, mime_type AS "mimeType",
          byte_size AS "byteSize", duration_seconds AS "durationSeconds"
      `, [
        principal.tenantId, conversationId, message.id, input.attachment.storageKey,
        input.attachment.mediaKind, input.attachment.mimeType, input.attachment.byteSize,
        input.attachment.durationSeconds ?? null,
      ]);
      await client.query('UPDATE conversations SET last_message_at = now(), updated_at = now(), status = $2 WHERE id = $1', [conversationId, 'waiting']);
      const quoted = input.replyToMessageId
        ? await client.query('SELECT id AS quoted_id, direction AS quoted_direction, body AS quoted_body FROM conversation_messages WHERE id = $1', [input.replyToMessageId])
        : null;
      return this.mapMessage({ ...message, ...quoted?.rows[0], sender_name: principal.name, attachments: attachment.rows });
    }));
  }

  markQueued(principal: AuthenticatedPrincipal, conversationId: string, messageId: string, jobId: string): Promise<ConversationMessageView | null> {
    return this.withRealtime(principal.tenantId, 'conversations', () => this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      const result = await client.query(`
        UPDATE conversation_messages SET status = 'queued', queue_job_id = $3
        WHERE id = $1 AND conversation_id = $2 AND status = 'pending'
        RETURNING *
      `, [messageId, conversationId, jobId]);
      return result.rows[0] ? this.mapMessage({ ...result.rows[0], sender_name: principal.name }) : null;
    }));
  }

  updateStatus(principal: AuthenticatedPrincipal, conversationId: string, status: ConversationStatus): Promise<ConversationSummaryView | null> {
    return this.withRealtime(principal.tenantId, 'conversations', () => this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      await client.query('UPDATE conversations SET status = $2, updated_at = now() WHERE id = $1', [conversationId, status]);
      return this.findSummary(client, principal, conversationId);
    }));
  }

  async connection(principal: AuthenticatedPrincipal, channelId: string): Promise<ConversationChannelConnectionView | null> {
    const connection = await this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        SELECT id, provider_key, status, pairing_expires_at, connection_error_code, connected_at, last_seen_at
        FROM conversation_channels
        WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)
      `, [channelId, principal.permissions.includes('channels.manage_all'), principal.userId]);
      return result.rows[0] ? this.mapConnection(result.rows[0]) : null;
    });
    if (!connection || connection.status !== 'awaiting_qr') return connection;
    const qrCode = await this.providerState.get(principal.tenantId, channelId, connection.providerKey, 'pairing_qr');
    return { ...connection, qrCode };
  }

  markConnectionRequested(principal: AuthenticatedPrincipal, channelId: string): Promise<boolean> {
    return this.withRealtime(principal.tenantId, 'channels', () => this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        UPDATE conversation_channels
        SET status = 'connecting', connection_error_code = NULL, pairing_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)
      `, [channelId, principal.permissions.includes('channels.manage_all'), principal.userId]);
      return Boolean(result.rowCount);
    }));
  }

  markDisconnectionRequested(principal: AuthenticatedPrincipal, channelId: string): Promise<boolean> {
    return this.withRealtime(principal.tenantId, 'channels', () => this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        UPDATE conversation_channels
        SET status = 'disconnecting', connection_error_code = NULL, pairing_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)
      `, [channelId, principal.permissions.includes('channels.manage_all'), principal.userId]);
      return Boolean(result.rowCount);
    }));
  }

  async markConnectionCommandFailed(principal: AuthenticatedPrincipal, channelId: string, failureCode: string): Promise<void> {
    await this.withRealtime(principal.tenantId, 'channels', () => this.database.withTenant(principal, async (client) => {
      await client.query(`
        UPDATE conversation_channels
        SET status = 'failed', connection_error_code = $4, pairing_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)
      `, [channelId, principal.permissions.includes('channels.manage_all'), principal.userId, failureCode]);
    }));
  }

  deleteChannel(principal: AuthenticatedPrincipal, channelId: string): Promise<'deleted' | 'not_found' | 'connected' | 'has_conversations' | 'has_reminders'> {
    return this.withRealtime(principal.tenantId, 'channels', () => this.database.withTenant(principal, async (client) => {
      const channel = await client.query<{ status: string }>(`
        SELECT status FROM conversation_channels
        WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)
        FOR UPDATE
      `, [channelId, principal.permissions.includes('channels.manage_all'), principal.userId]);
      if (!channel.rows[0]) return 'not_found';
      if (!['configured', 'disconnected'].includes(channel.rows[0].status)) return 'connected';
      const references = await client.query<{ has_conversations: boolean; has_reminders: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM conversations WHERE channel_id = $1) AS has_conversations,
          EXISTS (SELECT 1 FROM event_reminder_rules WHERE channel_id = $1) AS has_reminders
      `, [channelId]);
      if (references.rows[0]?.has_conversations) return 'has_conversations';
      if (references.rows[0]?.has_reminders) return 'has_reminders';
      await client.query('DELETE FROM conversation_channels WHERE id = $1', [channelId]);
      return 'deleted';
    }));
  }

  private async withRealtime<T>(tenantId: string, resource: ConversationRealtimeResource, operation: () => Promise<T>): Promise<T> {
    const result = await operation();
    void this.realtime.publish(tenantId, resource);
    return result;
  }

  private async canAccess(client: PoolClient, principal: AuthenticatedPrincipal, conversationId: string) {
    const result = await client.query(`
      SELECT 1 FROM conversations
      JOIN conversation_channels AS channels ON channels.id = conversations.channel_id AND channels.tenant_id = conversations.tenant_id
      WHERE conversations.id = $1 AND ($2::boolean OR conversations.assigned_user_id = $3 OR channels.owner_user_id = $3)
    `, [conversationId, principal.permissions.includes('conversations.read_all'), principal.userId]);
    return Boolean(result.rowCount);
  }

  private async findSummary(client: PoolClient, principal: AuthenticatedPrincipal, conversationId: string): Promise<ConversationSummaryView | null> {
    const result = await client.query(this.summarySql(`
      WHERE conversations.id = $1 AND ($2::boolean OR conversations.assigned_user_id = $3 OR channels.owner_user_id = $3)
    `), [conversationId, principal.permissions.includes('conversations.read_all'), principal.userId]);
    return result.rows[0] ? this.mapConversation(result.rows[0]) : null;
  }

  private summarySql(where: string) {
    return `
      SELECT conversations.*, channels.display_name AS channel_name, channels.phone_number,
        assignee.name AS assignee_name, events.title AS event_title, members.name AS member_name,
        (SELECT body FROM conversation_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message
      FROM conversations
      JOIN conversation_channels AS channels ON channels.id = conversations.channel_id AND channels.tenant_id = conversations.tenant_id
      JOIN users AS assignee ON assignee.id = conversations.assigned_user_id AND assignee.tenant_id = conversations.tenant_id
      LEFT JOIN users AS members ON members.id = conversations.member_user_id AND members.tenant_id = conversations.tenant_id
      LEFT JOIN events ON events.id = conversations.event_id AND events.tenant_id = conversations.tenant_id
      ${where}
    `;
  }

  private mapChannel(row: any): ConversationChannelView {
    return { id: row.id, owner: { id: row.owner_user_id, name: row.owner_name }, providerKey: row.provider_key, displayName: row.display_name, phoneNumber: row.phone_number, providerAccountId: row.provider_account_id, secretReference: row.secret_reference, status: row.status };
  }

  private mapConnection(row: any): ConversationChannelConnectionView {
    const iso = (value: Date | null): string | null => value ? value.toISOString() : null;
    return {
      channelId: row.id,
      providerKey: row.provider_key,
      status: row.status,
      qrCode: null,
      qrExpiresAt: iso(row.pairing_expires_at),
      failureCode: row.connection_error_code,
      connectedAt: iso(row.connected_at),
      lastSeenAt: iso(row.last_seen_at),
    };
  }

  private mapConversation(row: any): ConversationSummaryView {
    return { id: row.id, channel: { id: row.channel_id, displayName: row.channel_name, phoneNumber: row.phone_number }, assignedTo: { id: row.assigned_user_id, name: row.assignee_name }, event: row.event_id ? { id: row.event_id, title: row.event_title } : null, member: row.member_user_id ? { id: row.member_user_id, name: row.member_name } : null, contact: { name: row.contact_name, address: row.contact_address }, status: row.status, lastMessage: row.last_message, lastMessageAt: row.last_message_at.toISOString() };
  }

  private mapMessage(row: any): ConversationMessageView {
    return {
      id: row.id,
      direction: row.direction,
      body: row.body,
      status: row.status,
      sentBy: row.sender_name ?? null,
      createdAt: row.created_at.toISOString(),
      attachments: row.attachments ?? [],
      quotedMessage: row.quoted_id ? { id: row.quoted_id, direction: row.quoted_direction, body: row.quoted_body } : null,
      reactions: row.reactions ?? [],
    };
  }
}
