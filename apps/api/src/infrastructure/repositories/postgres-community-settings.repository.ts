import type { CommunitySettingsRepository } from '../../application/ports/community-settings.port';
import { CommunitySettings, type CommunitySettingsProps, type PaymentEnvironment, type PixKeyType } from '../../domain/entities/community-settings';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

interface IntegrationRow {
  category: 'identity' | 'payment';
  provider_key: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
  secret_reference: string | null;
}

export class PostgresCommunitySettingsRepository implements CommunitySettingsRepository {
  constructor(private readonly database: PostgresDatabase) {}

  get(principal: AuthenticatedPrincipal): Promise<CommunitySettingsProps> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<IntegrationRow>(`
        SELECT category, provider_key, enabled, configuration, secret_reference
        FROM community_integrations
        ORDER BY category, provider_key
      `);
      return this.mapRows(result.rows);
    });
  }

  save(principal: AuthenticatedPrincipal, settings: CommunitySettings): Promise<CommunitySettingsProps> {
    return this.database.withTenant(principal, async (client) => {
      const { socialLogin, payments } = settings.props;
      await this.upsert(client, principal.tenantId, 'identity', 'google', socialLogin.google.enabled, {
        clientId: socialLogin.google.clientId,
      }, socialLogin.google.secretReference);
      await this.upsert(client, principal.tenantId, 'identity', 'microsoft', socialLogin.microsoft.enabled, {
        clientId: socialLogin.microsoft.clientId,
      }, socialLogin.microsoft.secretReference);
      await this.upsert(client, principal.tenantId, 'payment', 'pix_manual', payments.pix.enabled, {
        keyType: payments.pix.keyType,
        key: payments.pix.key,
        recipientName: payments.pix.recipientName,
        city: payments.pix.city,
      }, '');

      await client.query(`
        DELETE FROM community_integrations
        WHERE category = 'payment' AND provider_key <> 'pix_manual'
      `);
      if (payments.gateway.providerKey) {
        await this.upsert(client, principal.tenantId, 'payment', payments.gateway.providerKey, payments.gateway.enabled, {
          environment: payments.gateway.environment,
          publicIdentifier: payments.gateway.publicIdentifier,
        }, payments.gateway.secretReference);
      }
      return settings.props;
    });
  }

  private async upsert(
    client: import('pg').PoolClient,
    tenantId: string,
    category: IntegrationRow['category'],
    providerKey: string,
    enabled: boolean,
    configuration: Record<string, unknown>,
    secretReference: string,
  ) {
    await client.query(`
      INSERT INTO community_integrations (
        tenant_id, category, provider_key, enabled, configuration, secret_reference
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (tenant_id, category, provider_key) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        configuration = EXCLUDED.configuration,
        secret_reference = EXCLUDED.secret_reference,
        updated_at = now()
    `, [tenantId, category, providerKey, enabled, JSON.stringify(configuration), secretReference || null]);
  }

  private mapRows(rows: IntegrationRow[]): CommunitySettingsProps {
    const defaults = CommunitySettings.defaults().props;
    const find = (category: IntegrationRow['category'], providerKey: string) =>
      rows.find((row) => row.category === category && row.provider_key === providerKey);
    const google = find('identity', 'google');
    const microsoft = find('identity', 'microsoft');
    const pix = find('payment', 'pix_manual');
    const gateway = rows.find((row) => row.category === 'payment' && row.provider_key !== 'pix_manual');

    return {
      socialLogin: {
        google: google ? {
          enabled: google.enabled,
          clientId: String(google.configuration.clientId ?? ''),
          secretReference: google.secret_reference ?? '',
        } : defaults.socialLogin.google,
        microsoft: microsoft ? {
          enabled: microsoft.enabled,
          clientId: String(microsoft.configuration.clientId ?? ''),
          secretReference: microsoft.secret_reference ?? '',
        } : defaults.socialLogin.microsoft,
      },
      payments: {
        pix: pix ? {
          enabled: pix.enabled,
          keyType: String(pix.configuration.keyType ?? 'random') as PixKeyType,
          key: String(pix.configuration.key ?? ''),
          recipientName: String(pix.configuration.recipientName ?? ''),
          city: String(pix.configuration.city ?? ''),
        } : defaults.payments.pix,
        gateway: gateway ? {
          enabled: gateway.enabled,
          providerKey: gateway.provider_key,
          environment: String(gateway.configuration.environment ?? 'sandbox') as PaymentEnvironment,
          publicIdentifier: String(gateway.configuration.publicIdentifier ?? ''),
          secretReference: gateway.secret_reference ?? '',
        } : defaults.payments.gateway,
      },
    };
  }
}
