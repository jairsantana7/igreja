import type { ConversationProviderStateStore, SensitiveStateCipher } from '../../application/ports/conversation.port';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresConversationProviderStateStore implements ConversationProviderStateStore {
  constructor(private readonly database: PostgresDatabase, private readonly cipher: SensitiveStateCipher) {}

  async get(tenantId: string, channelId: string, providerKey: string, stateKey: string): Promise<string | null> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query<{ encrypted_value: Buffer }>(`
        SELECT encrypted_value
        FROM conversation_provider_states
        WHERE channel_id = $1 AND provider_key = $2 AND state_key = $3
          AND (expires_at IS NULL OR expires_at > now())
      `, [channelId, providerKey, stateKey]);
      return result.rows[0] ? this.cipher.decrypt(result.rows[0].encrypted_value) : null;
    });
  }

  async set(input: { tenantId: string; channelId: string; providerKey: string; stateKey: string; value: string; expiresAt?: Date }): Promise<void> {
    const encrypted = this.cipher.encrypt(input.value);
    await this.database.withTenant(input.tenantId, async (client) => {
      await client.query(`
        INSERT INTO conversation_provider_states (
          tenant_id, channel_id, provider_key, state_key, encrypted_value, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, channel_id, provider_key, state_key) DO UPDATE
        SET encrypted_value = EXCLUDED.encrypted_value,
            expires_at = EXCLUDED.expires_at,
            updated_at = now()
      `, [input.tenantId, input.channelId, input.providerKey, input.stateKey, encrypted, input.expiresAt ?? null]);
    });
  }

  async remove(tenantId: string, channelId: string, providerKey: string, stateKey: string): Promise<void> {
    await this.database.withTenant(tenantId, async (client) => {
      await client.query(
        'DELETE FROM conversation_provider_states WHERE channel_id = $1 AND provider_key = $2 AND state_key = $3',
        [channelId, providerKey, stateKey],
      );
    });
  }

  async clear(tenantId: string, channelId: string, providerKey: string): Promise<void> {
    await this.database.withTenant(tenantId, async (client) => {
      await client.query(
        'DELETE FROM conversation_provider_states WHERE channel_id = $1 AND provider_key = $2',
        [channelId, providerKey],
      );
    });
  }
}
