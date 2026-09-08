import type {
  ConversationOutboundDelivery,
  ConversationRuntimeChannel,
  ConversationRuntimeRepository,
} from '../../application/ports/conversation.port';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresConversationRuntimeRepository implements ConversationRuntimeRepository {
  constructor(private readonly database: PostgresDatabase) {}

  findChannel(tenantId: string, channelId: string): Promise<ConversationRuntimeChannel | null> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query(`
        SELECT id, tenant_id, provider_key, phone_number, owner_user_id
        FROM conversation_channels
        WHERE id = $1
      `, [channelId]);
      const row = result.rows[0];
      return row ? {
        id: row.id,
        tenantId: row.tenant_id,
        providerKey: row.provider_key,
        phoneNumber: row.phone_number,
        ownerUserId: row.owner_user_id,
      } : null;
    });
  }

  findOutbound(tenantId: string, conversationId: string, messageId: string): Promise<ConversationOutboundDelivery | null> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query(`
        SELECT messages.id AS message_id, messages.body, conversations.id AS conversation_id,
          conversations.contact_address, channels.id AS channel_id, channels.tenant_id,
          channels.provider_key, channels.phone_number, channels.owner_user_id
        FROM conversation_messages AS messages
        JOIN conversations ON conversations.id = messages.conversation_id
          AND conversations.tenant_id = messages.tenant_id
        JOIN conversation_channels AS channels ON channels.id = conversations.channel_id
          AND channels.tenant_id = conversations.tenant_id
        WHERE messages.id = $1 AND conversations.id = $2
          AND messages.direction = 'outbound' AND messages.status IN ('pending', 'queued')
      `, [messageId, conversationId]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        channel: {
          id: row.channel_id,
          tenantId: row.tenant_id,
          providerKey: row.provider_key,
          phoneNumber: row.phone_number,
          ownerUserId: row.owner_user_id,
        },
        conversationId: row.conversation_id,
        messageId: row.message_id,
        recipient: row.contact_address,
        body: row.body,
      };
    });
  }

  async updateConnection(tenantId: string, channelId: string, update: Parameters<ConversationRuntimeRepository['updateConnection']>[2]): Promise<void> {
    await this.database.withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE conversation_channels
        SET status = $2,
            connection_error_code = $3,
            pairing_expires_at = $4::timestamptz,
            connected_at = CASE WHEN $2 = 'connected' THEN COALESCE(connected_at, now()) ELSE connected_at END,
            last_seen_at = CASE WHEN $2 = 'connected' THEN now() ELSE last_seen_at END,
            updated_at = now()
        WHERE id = $1
      `, [channelId, update.status, update.failureCode ?? null, update.qrExpiresAt ?? null]);
    });
  }

  async receiveInbound(input: Parameters<ConversationRuntimeRepository['receiveInbound']>[0]): Promise<void> {
    await this.database.withTenant(input.tenantId, async (client) => {
      const channel = await client.query<{ owner_user_id: string }>(
        'SELECT owner_user_id FROM conversation_channels WHERE id = $1',
        [input.channelId],
      );
      if (!channel.rows[0]) return;

      let conversation = await client.query<{ id: string }>(`
        SELECT id FROM conversations
        WHERE channel_id = $1 AND contact_address = $2
        ORDER BY last_message_at DESC, id DESC
        LIMIT 1
      `, [input.channelId, input.contactAddress]);
      if (!conversation.rows[0]) {
        conversation = await client.query<{ id: string }>(`
          INSERT INTO conversations (
            tenant_id, channel_id, assigned_user_id, contact_name, contact_address
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [input.tenantId, input.channelId, channel.rows[0].owner_user_id, input.contactName, input.contactAddress]);
      }

      const inserted = await client.query(`
        INSERT INTO conversation_messages (
          tenant_id, conversation_id, direction, body, status, provider_message_id, created_at
        ) VALUES ($1, $2, 'inbound', $3, 'received', $4, $5)
        ON CONFLICT (tenant_id, conversation_id, provider_message_id)
          WHERE provider_message_id IS NOT NULL DO NOTHING
      `, [input.tenantId, conversation.rows[0]!.id, input.body, input.providerMessageId, input.receivedAt]);
      if (inserted.rowCount) {
        await client.query(`
          UPDATE conversations
          SET contact_name = $2, status = 'open', last_message_at = $3, updated_at = now()
          WHERE id = $1
        `, [conversation.rows[0]!.id, input.contactName, input.receivedAt]);
      }
    });
  }

  async markOutboundSent(tenantId: string, conversationId: string, messageId: string, providerMessageId: string): Promise<void> {
    await this.database.withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE conversation_messages
        SET status = 'sent', provider_message_id = $3
        WHERE id = $1 AND conversation_id = $2
          AND direction = 'outbound' AND status IN ('pending', 'queued')
      `, [messageId, conversationId, providerMessageId]);
    });
  }

  async markOutboundFailed(tenantId: string, conversationId: string, messageId: string): Promise<void> {
    await this.database.withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE conversation_messages
        SET status = 'failed'
        WHERE id = $1 AND conversation_id = $2
          AND direction = 'outbound' AND status IN ('pending', 'queued')
      `, [messageId, conversationId]);
    });
  }

  async updateOutboundDelivery(tenantId: string, channelId: string, providerMessageId: string, status: 'sent' | 'delivered' | 'read'): Promise<void> {
    await this.database.withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE conversation_messages AS messages
        SET status = CASE
          WHEN messages.status = 'read' THEN 'read'
          WHEN messages.status = 'delivered' AND $3 = 'sent' THEN 'delivered'
          ELSE $3
        END
        FROM conversations
        WHERE conversations.id = messages.conversation_id
          AND conversations.tenant_id = messages.tenant_id
          AND conversations.channel_id = $1
          AND messages.provider_message_id = $2
          AND messages.direction = 'outbound'
      `, [channelId, providerMessageId, status]);
    });
  }
}
