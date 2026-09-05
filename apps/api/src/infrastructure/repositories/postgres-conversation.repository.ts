import type { PoolClient } from 'pg';
import type { ConversationChannelView, ConversationMessageView, ConversationRepository, ConversationSummaryView } from '../../application/ports/conversation.port';
import type { ConversationChannelConfiguration, ConversationStatus, OutboundConversationMessage } from '../../domain/entities/conversation';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { ConflictError } from '../../application/use-cases/errors';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresConversationRepository implements ConversationRepository {
  constructor(private readonly database: PostgresDatabase) {}

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
    return this.database.withTenant(principal, async (client) => {
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
    });
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
    return this.database.withTenant(principal, async (client) => {
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
    });
  }

  messages(principal: AuthenticatedPrincipal, conversationId: string): Promise<ConversationMessageView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      const result = await client.query(`
        SELECT messages.*, users.name AS sender_name
        FROM conversation_messages AS messages
        LEFT JOIN users ON users.id = messages.sent_by_user_id AND users.tenant_id = messages.tenant_id
        WHERE messages.conversation_id = $1
        ORDER BY messages.created_at, messages.id
      `, [conversationId]);
      return result.rows.map(this.mapMessage);
    });
  }

  addOutbound(principal: AuthenticatedPrincipal, conversationId: string, message: OutboundConversationMessage): Promise<ConversationMessageView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      const result = await client.query(`
        INSERT INTO conversation_messages (tenant_id, conversation_id, sent_by_user_id, direction, body, status)
        VALUES ($1, $2, $3, 'outbound', $4, 'pending')
        RETURNING *
      `, [principal.tenantId, conversationId, principal.userId, message.body]);
      await client.query('UPDATE conversations SET last_message_at = now(), updated_at = now(), status = $2 WHERE id = $1', [conversationId, 'waiting']);
      return this.mapMessage({ ...result.rows[0], sender_name: principal.name });
    });
  }

  markQueued(principal: AuthenticatedPrincipal, conversationId: string, messageId: string, jobId: string): Promise<ConversationMessageView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      const result = await client.query(`
        UPDATE conversation_messages SET status = 'queued', queue_job_id = $3
        WHERE id = $1 AND conversation_id = $2 AND status = 'pending'
        RETURNING *
      `, [messageId, conversationId, jobId]);
      return result.rows[0] ? this.mapMessage({ ...result.rows[0], sender_name: principal.name }) : null;
    });
  }

  updateStatus(principal: AuthenticatedPrincipal, conversationId: string, status: ConversationStatus): Promise<ConversationSummaryView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccess(client, principal, conversationId))) return null;
      await client.query('UPDATE conversations SET status = $2, updated_at = now() WHERE id = $1', [conversationId, status]);
      return this.findSummary(client, principal, conversationId);
    });
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
        assignee.name AS assignee_name, events.title AS event_title,
        (SELECT body FROM conversation_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message
      FROM conversations
      JOIN conversation_channels AS channels ON channels.id = conversations.channel_id AND channels.tenant_id = conversations.tenant_id
      JOIN users AS assignee ON assignee.id = conversations.assigned_user_id AND assignee.tenant_id = conversations.tenant_id
      LEFT JOIN events ON events.id = conversations.event_id AND events.tenant_id = conversations.tenant_id
      ${where}
    `;
  }

  private mapChannel(row: any): ConversationChannelView {
    return { id: row.id, owner: { id: row.owner_user_id, name: row.owner_name }, providerKey: row.provider_key, displayName: row.display_name, phoneNumber: row.phone_number, providerAccountId: row.provider_account_id, secretReference: row.secret_reference, status: row.status };
  }

  private mapConversation(row: any): ConversationSummaryView {
    return { id: row.id, channel: { id: row.channel_id, displayName: row.channel_name, phoneNumber: row.phone_number }, assignedTo: { id: row.assigned_user_id, name: row.assignee_name }, event: row.event_id ? { id: row.event_id, title: row.event_title } : null, contact: { name: row.contact_name, address: row.contact_address }, status: row.status, lastMessage: row.last_message, lastMessageAt: row.last_message_at.toISOString() };
  }

  private mapMessage(row: any): ConversationMessageView {
    return { id: row.id, direction: row.direction, body: row.body, status: row.status, sentBy: row.sender_name ?? null, createdAt: row.created_at.toISOString() };
  }
}
