import type {
  ConversationIncomingAttachment,
  ConversationOutboundDelivery,
  ConversationRuntimeChannel,
  ConversationRuntimeRepository,
} from '../../application/ports/conversation.port';
import { PostgresDatabase } from '../database/postgres.database';
import type { PoolClient } from 'pg';
import type { ConversationRealtimeBus, ConversationRealtimeResource } from '../../application/ports/conversation-realtime.port';

export class PostgresConversationRuntimeRepository implements ConversationRuntimeRepository {
  constructor(private readonly database: PostgresDatabase, private readonly realtime: ConversationRealtimeBus) {}

  async listRestorableChannels(): Promise<Array<{ tenantId: string; channelId: string }>> {
    const result = await this.database.queryPublic<{ tenant_id: string; channel_id: string }>(
      'SELECT tenant_id, channel_id FROM app.list_restorable_conversation_channels()',
    );
    return result.rows.map((row) => ({ tenantId: row.tenant_id, channelId: row.channel_id }));
  }

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
          channels.provider_key, channels.phone_number, channels.owner_user_id,
          attachments.storage_key, attachments.mime_type, attachments.media_kind,
          quoted.provider_message_id AS quoted_provider_message_id,
          quoted.direction AS quoted_direction, quoted.body AS quoted_body
        FROM conversation_messages AS messages
        JOIN conversations ON conversations.id = messages.conversation_id
          AND conversations.tenant_id = messages.tenant_id
        JOIN conversation_channels AS channels ON channels.id = conversations.channel_id
          AND channels.tenant_id = conversations.tenant_id
        LEFT JOIN LATERAL (
          SELECT storage_key, mime_type, media_kind
          FROM conversation_message_attachments
          WHERE message_id = messages.id
            AND conversation_id = messages.conversation_id
            AND tenant_id = messages.tenant_id
          ORDER BY id
          LIMIT 1
        ) AS attachments ON true
        LEFT JOIN conversation_messages AS quoted ON quoted.id = messages.quoted_message_id
          AND quoted.conversation_id = messages.conversation_id
          AND quoted.tenant_id = messages.tenant_id
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
        attachment: row.storage_key ? {
          storageKey: row.storage_key,
          mimeType: row.mime_type,
          mediaKind: row.media_kind,
        } : undefined,
        quotedMessage: row.quoted_provider_message_id ? {
          providerMessageId: row.quoted_provider_message_id,
          direction: row.quoted_direction,
          body: row.quoted_body,
        } : undefined,
      };
    });
  }

  findReactionDelivery(
    tenantId: string,
    conversationId: string,
    messageId: string,
    emoji: Parameters<ConversationRuntimeRepository['findReactionDelivery']>[3],
  ): ReturnType<ConversationRuntimeRepository['findReactionDelivery']> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query(`
        SELECT messages.id AS message_id, messages.provider_message_id, messages.direction, messages.body,
          conversations.id AS conversation_id, conversations.contact_address,
          channels.id AS channel_id, channels.tenant_id, channels.provider_key,
          channels.phone_number, channels.owner_user_id
        FROM conversation_messages AS messages
        JOIN conversations ON conversations.id = messages.conversation_id
          AND conversations.tenant_id = messages.tenant_id
        JOIN conversation_channels AS channels ON channels.id = conversations.channel_id
          AND channels.tenant_id = conversations.tenant_id
        WHERE messages.id = $1 AND conversations.id = $2
          AND messages.provider_message_id IS NOT NULL
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
        target: {
          providerMessageId: row.provider_message_id,
          direction: row.direction,
          body: row.body,
        },
        emoji,
      };
    });
  }

  findHistorySync(tenantId: string, conversationId: string): ReturnType<ConversationRuntimeRepository['findHistorySync']> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query(`
        SELECT conversations.id AS conversation_id, conversations.contact_address,
          channels.id AS channel_id, channels.tenant_id, channels.provider_key,
          channels.phone_number, channels.owner_user_id,
          oldest.provider_message_id, oldest.direction, oldest.created_at
        FROM conversations
        JOIN conversation_channels AS channels
          ON channels.id = conversations.channel_id AND channels.tenant_id = conversations.tenant_id
        JOIN LATERAL (
          SELECT provider_message_id, direction, created_at
          FROM conversation_messages
          WHERE conversation_id = conversations.id
            AND tenant_id = conversations.tenant_id
            AND provider_message_id IS NOT NULL
          ORDER BY created_at, id
          LIMIT 1
        ) AS oldest ON true
        WHERE conversations.id = $1
      `, [conversationId]);
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
        recipient: row.contact_address,
        oldestMessage: {
          providerMessageId: row.provider_message_id,
          direction: row.direction,
          createdAt: row.created_at,
        },
      };
    });
  }

  async updateConnection(tenantId: string, channelId: string, update: Parameters<ConversationRuntimeRepository['updateConnection']>[2]): Promise<void> {
    await this.withRealtime(tenantId, 'channels', () => this.database.withTenant(tenantId, async (client) => {
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
    }));
  }

  async receiveInbound(input: Parameters<ConversationRuntimeRepository['receiveInbound']>[0]): Promise<boolean> {
    return this.withRealtime(input.tenantId, 'conversations', () => this.database.withTenant(input.tenantId, async (client) => {
      const channel = await client.query<{ owner_user_id: string }>(
        'SELECT owner_user_id FROM conversation_channels WHERE id = $1',
        [input.channelId],
      );
      if (!channel.rows[0]) return false;

      const addresses = [...new Set([input.contactAddress, ...(input.contactAddressAliases ?? [])])];
      let conversation = await client.query<{ id: string }>(`
        SELECT id FROM conversations
        WHERE channel_id = $1 AND contact_address = ANY($2::text[])
        ORDER BY last_message_at DESC, id DESC
        LIMIT 1
      `, [input.channelId, addresses]);
      if (!conversation.rows[0]) {
        conversation = await client.query<{ id: string }>(`
          INSERT INTO conversations (
            tenant_id, channel_id, assigned_user_id, contact_name, contact_address
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [input.tenantId, input.channelId, channel.rows[0].owner_user_id, input.contactName, input.contactAddress]);
      }

      const quotedMessageId = input.quotedProviderMessageId
        ? (await client.query<{ id: string }>(`
            SELECT id FROM conversation_messages
            WHERE conversation_id = $1 AND provider_message_id = $2
            LIMIT 1
          `, [conversation.rows[0]!.id, input.quotedProviderMessageId])).rows[0]?.id ?? null
        : null;

      const inserted = await client.query<{ id: string }>(`
        INSERT INTO conversation_messages (
          tenant_id, conversation_id, direction, body, status, provider_message_id, quoted_message_id, created_at
        ) VALUES ($1, $2, 'inbound', $3, 'received', $4, $5, $6)
        ON CONFLICT (tenant_id, conversation_id, provider_message_id)
          WHERE provider_message_id IS NOT NULL DO NOTHING
        RETURNING id
      `, [input.tenantId, conversation.rows[0]!.id, input.body, input.providerMessageId, quotedMessageId, input.receivedAt]);
      if (inserted.rowCount) {
        if (input.attachment) {
          await this.insertAttachment(client, input.tenantId, conversation.rows[0]!.id, inserted.rows[0]!.id, input.attachment);
        }
        await client.query(`
          UPDATE conversations
          SET contact_name = $2, contact_address = $3, status = 'open', last_message_at = $4, updated_at = now()
          WHERE id = $1
        `, [conversation.rows[0]!.id, input.contactName, input.contactAddress, input.receivedAt]);
      }
      return Boolean(inserted.rowCount);
    }));
  }

  async receiveOutboundMirror(input: Parameters<ConversationRuntimeRepository['receiveOutboundMirror']>[0]): Promise<boolean> {
    return this.withRealtime(input.tenantId, 'conversations', () => this.database.withTenant(input.tenantId, async (client) => {
      const channel = await client.query<{ owner_user_id: string }>(
        'SELECT owner_user_id FROM conversation_channels WHERE id = $1',
        [input.channelId],
      );
      if (!channel.rows[0]) return false;

      const addresses = [...new Set([input.contactAddress, ...(input.contactAddressAliases ?? [])])];
      let conversation = await client.query<{ id: string }>(`
        SELECT id FROM conversations
        WHERE channel_id = $1 AND contact_address = ANY($2::text[])
        ORDER BY last_message_at DESC, id DESC
        LIMIT 1
      `, [input.channelId, addresses]);
      if (!conversation.rows[0]) {
        conversation = await client.query<{ id: string }>(`
          INSERT INTO conversations (
            tenant_id, channel_id, assigned_user_id, contact_name, contact_address
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [input.tenantId, input.channelId, channel.rows[0].owner_user_id, input.contactName, input.contactAddress]);
      }
      const conversationId = conversation.rows[0]!.id;
      const quotedMessageId = input.quotedProviderMessageId
        ? (await client.query<{ id: string }>(`
            SELECT id FROM conversation_messages
            WHERE conversation_id = $1 AND provider_message_id = $2
            LIMIT 1
          `, [conversationId, input.quotedProviderMessageId])).rows[0]?.id ?? null
        : null;

      const matched = input.attachment ? await client.query(`
        UPDATE conversation_messages SET status = 'sent', provider_message_id = $5
        WHERE id = (
          SELECT messages.id FROM conversation_messages AS messages
          JOIN conversation_message_attachments AS attachments
            ON attachments.message_id = messages.id
            AND attachments.conversation_id = messages.conversation_id
            AND attachments.tenant_id = messages.tenant_id
          WHERE messages.conversation_id = $1 AND messages.direction = 'outbound'
            AND messages.provider_message_id IS NULL AND messages.status IN ('pending', 'queued')
            AND messages.body = $2 AND attachments.media_kind = $3 AND attachments.mime_type = $4
          ORDER BY messages.created_at DESC, messages.id DESC
          LIMIT 1
        )
        RETURNING id
      `, [conversationId, input.body, input.attachment.mediaKind, input.attachment.mimeType, input.providerMessageId]) : await client.query(`
        UPDATE conversation_messages SET status = 'sent', provider_message_id = $3
        WHERE id = (
          SELECT id FROM conversation_messages
          WHERE conversation_id = $1 AND direction = 'outbound'
            AND provider_message_id IS NULL AND status IN ('pending', 'queued') AND body = $2
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        )
        RETURNING id
      `, [conversationId, input.body, input.providerMessageId]);
      let attachmentRetained = false;
      if (!matched.rowCount) {
        const inserted = await client.query<{ id: string }>(`
          INSERT INTO conversation_messages (
            tenant_id, conversation_id, sent_by_user_id, direction, body, status,
            provider_message_id, quoted_message_id, created_at
          ) VALUES ($1, $2, $3, 'outbound', $4, 'sent', $5, $6, $7)
          ON CONFLICT (tenant_id, conversation_id, provider_message_id)
            WHERE provider_message_id IS NOT NULL DO NOTHING
          RETURNING id
        `, [
          input.tenantId, conversationId, channel.rows[0].owner_user_id, input.body,
          input.providerMessageId, quotedMessageId, input.sentAt,
        ]);
        if (inserted.rows[0] && input.attachment) {
          await this.insertAttachment(client, input.tenantId, conversationId, inserted.rows[0].id, input.attachment);
          attachmentRetained = true;
        }
      }
      await client.query(`
        UPDATE conversations
        SET contact_address = $2, status = 'waiting',
          last_message_at = GREATEST(last_message_at, $3), updated_at = now()
        WHERE id = $1
      `, [conversationId, input.contactAddress, input.sentAt]);
      return input.attachment ? attachmentRetained : Boolean(matched.rowCount);
    }));
  }

  async ensureConversation(input: Parameters<ConversationRuntimeRepository['ensureConversation']>[0]): Promise<void> {
    await this.withRealtime(input.tenantId, 'conversations', () => this.database.withTenant(input.tenantId, async (client) => {
      const channel = await client.query<{ owner_user_id: string }>(
        'SELECT owner_user_id FROM conversation_channels WHERE id = $1',
        [input.channelId],
      );
      if (!channel.rows[0]) return;
      const addresses = [...new Set([input.contactAddress, ...(input.contactAddressAliases ?? [])])];
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM conversations
        WHERE channel_id = $1 AND contact_address = ANY($2::text[])
        ORDER BY last_message_at DESC, id DESC
        LIMIT 1
      `, [input.channelId, addresses]);
      if (existing.rows[0]) {
        await client.query(`
          UPDATE conversations
          SET contact_name = CASE WHEN $2 NOT LIKE 'Contato %' THEN $2 ELSE contact_name END,
            contact_address = $3,
            last_message_at = GREATEST(last_message_at, $4),
            updated_at = now()
          WHERE id = $1
        `, [existing.rows[0].id, input.contactName, input.contactAddress, input.lastActivityAt]);
        return;
      }
      await client.query(`
        INSERT INTO conversations (
          tenant_id, channel_id, assigned_user_id, contact_name, contact_address, last_message_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        input.tenantId, input.channelId, channel.rows[0].owner_user_id,
        input.contactName, input.contactAddress, input.lastActivityAt,
      ]);
    }));
  }

  async applyReaction(input: Parameters<ConversationRuntimeRepository['applyReaction']>[0]): Promise<void> {
    const databaseContext = input.createdByUserId
      ? { tenantId: input.tenantId, userId: input.createdByUserId }
      : input.tenantId;
    await this.withRealtime(input.tenantId, 'conversations', () => this.database.withTenant(databaseContext, async (client) => {
      const target = await client.query<{ id: string; conversation_id: string }>(`
        SELECT messages.id, messages.conversation_id
        FROM conversation_messages AS messages
        JOIN conversations ON conversations.id = messages.conversation_id
          AND conversations.tenant_id = messages.tenant_id
        WHERE conversations.channel_id = $1 AND messages.provider_message_id = $2
        LIMIT 1
      `, [input.channelId, input.targetProviderMessageId]);
      if (!target.rows[0]) return;
      if (!input.emoji) {
        await client.query(`
          DELETE FROM conversation_message_reactions
          WHERE message_id = $1 AND actor_kind = $2
        `, [target.rows[0].id, input.actor]);
        return;
      }
      await client.query(`
        INSERT INTO conversation_message_reactions (
          tenant_id, conversation_id, message_id, actor_kind, emoji, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, message_id, actor_kind) DO UPDATE
        SET emoji = EXCLUDED.emoji,
          created_by_user_id = EXCLUDED.created_by_user_id,
          updated_at = now()
      `, [
        input.tenantId, target.rows[0].conversation_id, target.rows[0].id,
        input.actor, input.emoji, input.createdByUserId ?? null,
      ]);
    }));
  }

  private async insertAttachment(
    client: PoolClient,
    tenantId: string,
    conversationId: string,
    messageId: string,
    attachment: ConversationIncomingAttachment,
  ): Promise<void> {
    await client.query(`
      INSERT INTO conversation_message_attachments (
        tenant_id, conversation_id, message_id, storage_key, media_kind,
        mime_type, byte_size, duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      tenantId, conversationId, messageId, attachment.storageKey, attachment.mediaKind,
      attachment.mimeType, attachment.byteSize, attachment.durationSeconds ?? null,
    ]);
  }

  listUnresolvedContacts(tenantId: string, channelId: string): Promise<Array<{ conversationId: string; contactAddress: string }>> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query<{ id: string; contact_address: string }>(`
        SELECT id, contact_address FROM conversations
        WHERE channel_id = $1 AND contact_address LIKE '%@lid'
        ORDER BY last_message_at DESC, id DESC
      `, [channelId]);
      return result.rows.map((row) => ({ conversationId: row.id, contactAddress: row.contact_address }));
    });
  }

  async resolveContactAddress(tenantId: string, channelId: string, conversationId: string, contactAddress: string): Promise<void> {
    await this.withRealtime(tenantId, 'conversations', () => this.database.withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE conversations
        SET contact_address = $4, updated_at = now()
        WHERE id = $1 AND channel_id = $2 AND tenant_id = $3 AND contact_address LIKE '%@lid'
      `, [conversationId, channelId, tenantId, contactAddress]);
    }));
  }

  async markOutboundSent(tenantId: string, conversationId: string, messageId: string, providerMessageId: string): Promise<void> {
    await this.withRealtime(tenantId, 'conversations', () => this.database.withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE conversation_messages
        SET status = 'sent', provider_message_id = $3
        WHERE id = $1 AND conversation_id = $2
          AND direction = 'outbound' AND status IN ('pending', 'queued')
      `, [messageId, conversationId, providerMessageId]);
    }));
  }

  async markOutboundFailed(tenantId: string, conversationId: string, messageId: string): Promise<void> {
    await this.withRealtime(tenantId, 'conversations', () => this.database.withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE conversation_messages
        SET status = 'failed'
        WHERE id = $1 AND conversation_id = $2
          AND direction = 'outbound' AND status IN ('pending', 'queued')
      `, [messageId, conversationId]);
    }));
  }

  async updateOutboundDelivery(tenantId: string, channelId: string, providerMessageId: string, status: 'sent' | 'delivered' | 'read'): Promise<void> {
    await this.withRealtime(tenantId, 'conversations', () => this.database.withTenant(tenantId, async (client) => {
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
    }));
  }

  private async withRealtime<T>(tenantId: string, resource: ConversationRealtimeResource, operation: () => Promise<T>): Promise<T> {
    const result = await operation();
    void this.realtime.publish(tenantId, resource);
    return result;
  }
}
