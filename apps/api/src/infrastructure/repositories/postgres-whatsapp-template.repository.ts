import type { WhatsAppTemplateRepository, WhatsAppTemplateView } from '../../application/ports/whatsapp-template.port';
import type { WhatsAppTemplateProjection } from '../../domain/entities/whatsapp-template';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresWhatsAppTemplateRepository implements WhatsAppTemplateRepository {
  constructor(private readonly database: PostgresDatabase) {}

  findChannel(principal: AuthenticatedPrincipal, channelId: string) {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<{ id: string; provider_key: string; provider_account_id: string; secret_reference: string | null }>(`
        SELECT id, provider_key, provider_account_id, secret_reference FROM conversation_channels
        WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)
      `, [channelId, principal.permissions.includes('channels.manage_all'), principal.userId]);
      const row = result.rows[0];
      return row ? { id: row.id, providerKey: row.provider_key, providerAccountId: row.provider_account_id, secretReference: row.secret_reference } : null;
    });
  }

  list(principal: AuthenticatedPrincipal, channelId: string): Promise<WhatsAppTemplateView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.channelIsAccessible(client, principal, channelId))) return null;
      return this.listWithClient(client, channelId);
    });
  }

  synchronize(principal: AuthenticatedPrincipal, channelId: string, templates: WhatsAppTemplateProjection[]): Promise<WhatsAppTemplateView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.channelIsAccessible(client, principal, channelId))) return null;
      const remoteIds = templates.map((template) => template.props.providerTemplateId);
      await client.query(`UPDATE whatsapp_message_templates SET active = false, updated_at = now()
        WHERE channel_id = $1 AND active AND NOT (provider_template_id = ANY($2::text[]))`, [channelId, remoteIds]);
      for (const template of templates) {
        const props = template.props;
        await client.query(`
          INSERT INTO whatsapp_message_templates (
            tenant_id, channel_id, provider_template_id, name, language, category, status, components
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          ON CONFLICT (tenant_id, channel_id, provider_template_id) DO UPDATE SET
            name = EXCLUDED.name, language = EXCLUDED.language, category = EXCLUDED.category,
            status = EXCLUDED.status, components = EXCLUDED.components, active = true, updated_at = now()
          WHERE (whatsapp_message_templates.name, whatsapp_message_templates.language,
                 whatsapp_message_templates.category, whatsapp_message_templates.status,
                 whatsapp_message_templates.components, whatsapp_message_templates.active)
            IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.language, EXCLUDED.category,
                              EXCLUDED.status, EXCLUDED.components, true)
        `, [principal.tenantId, channelId, props.providerTemplateId, props.name, props.language, props.category, props.status, JSON.stringify(props.components)]);
      }
      await client.query("UPDATE conversation_channels SET status = 'connected', templates_synchronized_at = now(), updated_at = now() WHERE id = $1", [channelId]);
      return this.listWithClient(client, channelId);
    });
  }

  private async channelIsAccessible(client: import('pg').PoolClient, principal: AuthenticatedPrincipal, channelId: string) {
    const result = await client.query('SELECT 1 FROM conversation_channels WHERE id = $1 AND ($2::boolean OR owner_user_id = $3)', [channelId, principal.permissions.includes('channels.manage_all'), principal.userId]);
    return Boolean(result.rowCount);
  }

  private async listWithClient(client: import('pg').PoolClient, channelId: string): Promise<WhatsAppTemplateView[]> {
    const result = await client.query<any>(`
      SELECT id, channel_id, provider_template_id, name, language, category, status, components, updated_at
      FROM whatsapp_message_templates WHERE channel_id = $1 AND active
      ORDER BY name, language, id
    `, [channelId]);
    return result.rows.map((row: any) => {
      const body = (row.components as Array<any>).find((component) => String(component?.type).toUpperCase() === 'BODY');
      const bodyText = typeof body?.text === 'string' ? body.text : null;
      const variables = bodyText ? [...new Set([...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]!))] : [];
      return { id: row.id, channelId: row.channel_id, providerTemplateId: row.provider_template_id, name: row.name, language: row.language, category: row.category, status: row.status, bodyText, variables, updatedAt: row.updated_at.toISOString() };
    });
  }
}
