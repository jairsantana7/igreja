import type { PoolClient } from 'pg';
import type {
  CommunicationTemplateRepository,
  CommunicationTemplateVersionView,
  CommunicationTemplateView,
  EventReminderRepository,
  EventReminderView,
  SaveEventReminderResult,
} from '../../application/ports/communication-template.port';
import type { CommunicationTemplateContent, CommunicationTemplateStatus, EventReminderConfiguration } from '../../domain/entities/communication-template';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';
import { ConflictError } from '../../application/use-cases/errors';

const canManageAllEvents = (principal: AuthenticatedPrincipal) => principal.permissions.includes('events.manage_all');
const canManageAllChannels = (principal: AuthenticatedPrincipal) => principal.permissions.includes('channels.manage_all');

async function canManageEvent(client: PoolClient, principal: AuthenticatedPrincipal, eventId: string) {
  const result = await client.query(`
    SELECT 1 FROM events
    WHERE id = $1 AND ($2::boolean OR created_by_user_id = $3 OR EXISTS (
      SELECT 1 FROM event_collaborators
      WHERE event_collaborators.event_id = events.id AND event_collaborators.user_id = $3
    ))
  `, [eventId, canManageAllEvents(principal), principal.userId]);
  return Boolean(result.rowCount);
}

export class PostgresCommunicationTemplateRepository implements CommunicationTemplateRepository {
  constructor(private readonly database: PostgresDatabase) {}

  list(principal: AuthenticatedPrincipal): Promise<CommunicationTemplateView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        SELECT templates.*, versions.id AS version_id, versions.version, versions.subject,
          versions.body, versions.variables, versions.created_at AS version_created_at,
          creators.id AS version_creator_id, creators.name AS version_creator_name,
          counts.version_count
        FROM communication_templates AS templates
        JOIN LATERAL (
          SELECT * FROM communication_template_versions
          WHERE template_id = templates.id ORDER BY version DESC LIMIT 1
        ) AS versions ON true
        JOIN users AS creators ON creators.id = versions.created_by_user_id AND creators.tenant_id = versions.tenant_id
        JOIN LATERAL (
          SELECT count(*)::integer AS version_count FROM communication_template_versions
          WHERE template_id = templates.id
        ) AS counts ON true
        ORDER BY templates.status = 'archived', templates.name, templates.id
      `);
      return result.rows.map(mapTemplate);
    });
  }

  versions(principal: AuthenticatedPrincipal, templateId: string): Promise<CommunicationTemplateVersionView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await client.query('SELECT 1 FROM communication_templates WHERE id = $1', [templateId])).rowCount) return null;
      const result = await client.query(`
        SELECT versions.*, users.name AS creator_name
        FROM communication_template_versions AS versions
        JOIN users ON users.id = versions.created_by_user_id AND users.tenant_id = versions.tenant_id
        WHERE versions.template_id = $1 ORDER BY versions.version DESC
      `, [templateId]);
      return result.rows.map(mapVersion);
    });
  }

  create(principal: AuthenticatedPrincipal, content: CommunicationTemplateContent): Promise<CommunicationTemplateView> {
    return this.database.withTenant(principal, async (client) => {
      const props = content.props;
      let template;
      try {
        template = await client.query(`
          INSERT INTO communication_templates (tenant_id, created_by_user_id, name, purpose, channel)
          VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [principal.tenantId, principal.userId, props.name, props.purpose, props.channel]);
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Já existe um modelo com este nome.');
        throw error;
      }
      const version = await client.query(`
        INSERT INTO communication_template_versions (tenant_id, template_id, version, subject, body, variables, created_by_user_id)
        VALUES ($1, $2, 1, $3, $4, $5::jsonb, $6)
        RETURNING *, $7::text AS creator_name
      `, [principal.tenantId, template.rows[0].id, props.subject, props.body, JSON.stringify(props.variables), principal.userId, principal.name]);
      return mapTemplate({
        ...template.rows[0], version_id: version.rows[0].id, version: version.rows[0].version,
        subject: version.rows[0].subject, body: version.rows[0].body, variables: version.rows[0].variables,
        version_created_at: version.rows[0].created_at, version_creator_id: principal.userId,
        version_creator_name: principal.name, version_count: 1,
      });
    });
  }

  update(principal: AuthenticatedPrincipal, templateId: string, content: CommunicationTemplateContent): Promise<CommunicationTemplateView | null> {
    return this.database.withTenant(principal, async (client) => {
      const current = await client.query('SELECT * FROM communication_templates WHERE id = $1 FOR UPDATE', [templateId]);
      if (!current.rows[0]) return null;
      const props = content.props;
      if (current.rows[0].channel !== props.channel) throw new ConflictError('O canal de um modelo existente não pode ser alterado. Crie outro modelo.');
      let updated;
      try {
        updated = await client.query(`
          UPDATE communication_templates SET name = $2, purpose = $3, updated_at = now()
          WHERE id = $1 RETURNING *
        `, [templateId, props.name, props.purpose]);
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Já existe um modelo com este nome.');
        throw error;
      }
      const versionNumber = await client.query<{ next_version: number }>(
        'SELECT COALESCE(max(version), 0)::integer + 1 AS next_version FROM communication_template_versions WHERE template_id = $1',
        [templateId],
      );
      const version = await client.query(`
        INSERT INTO communication_template_versions (tenant_id, template_id, version, subject, body, variables, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *
      `, [principal.tenantId, templateId, versionNumber.rows[0]!.next_version, props.subject, props.body, JSON.stringify(props.variables), principal.userId]);
      return mapTemplate({ ...updated.rows[0], version_id: version.rows[0].id, version: version.rows[0].version, subject: version.rows[0].subject, body: version.rows[0].body, variables: version.rows[0].variables, version_created_at: version.rows[0].created_at, version_creator_id: principal.userId, version_creator_name: principal.name, version_count: version.rows[0].version });
    });
  }

  setStatus(principal: AuthenticatedPrincipal, templateId: string, status: CommunicationTemplateStatus): Promise<CommunicationTemplateView | null> {
    return this.database.withTenant(principal, async (client) => {
      const updated = await client.query('UPDATE communication_templates SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [templateId, status]);
      if (!updated.rows[0]) return null;
      const result = await client.query(`
        SELECT versions.id AS version_id, versions.version, versions.subject, versions.body, versions.variables,
          versions.created_at AS version_created_at, users.id AS version_creator_id,
          users.name AS version_creator_name,
          (SELECT count(*)::integer FROM communication_template_versions WHERE template_id = $1) AS version_count
        FROM communication_template_versions AS versions
        JOIN users ON users.id = versions.created_by_user_id AND users.tenant_id = versions.tenant_id
        WHERE versions.template_id = $1 ORDER BY versions.version DESC LIMIT 1
      `, [templateId]);
      return mapTemplate({ ...updated.rows[0], ...result.rows[0] });
    });
  }
}

export class PostgresEventReminderRepository implements EventReminderRepository {
  constructor(private readonly database: PostgresDatabase) {}

  list(principal: AuthenticatedPrincipal, eventId: string): Promise<EventReminderView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canManageEvent(client, principal, eventId))) return null;
      const result = await client.query(reminderSelect('rules.event_id = $1'), [eventId]);
      return result.rows.map(mapReminder);
    });
  }

  create(principal: AuthenticatedPrincipal, eventId: string, templateId: string, channelId: string, config: EventReminderConfiguration): Promise<SaveEventReminderResult> {
    return this.database.withTenant(principal, async (client) => {
      const resolved = await this.resolveInputs(client, principal, eventId, templateId, channelId);
      if (!resolved.ok) return resolved;
      const result = await client.query(`
        INSERT INTO event_reminder_rules (
          tenant_id, event_id, template_id, template_version_id, channel_id, created_by_user_id,
          audience, offset_minutes_before, enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
      `, [principal.tenantId, eventId, templateId, resolved.versionId, channelId, principal.userId, config.props.audience, config.props.offsetMinutesBefore, config.props.enabled]);
      return { ok: true, value: await this.find(client, result.rows[0].id) };
    });
  }

  update(principal: AuthenticatedPrincipal, eventId: string, reminderId: string, templateId: string, channelId: string, config: EventReminderConfiguration): Promise<SaveEventReminderResult> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canManageEvent(client, principal, eventId))) return { ok: false, reason: 'event_not_found' };
      if (!(await client.query('SELECT 1 FROM event_reminder_rules WHERE id = $1 AND event_id = $2', [reminderId, eventId])).rowCount) return { ok: false, reason: 'reminder_not_found' };
      const resolved = await this.resolveInputs(client, principal, eventId, templateId, channelId, true);
      if (!resolved.ok) return resolved;
      await client.query(`
        UPDATE event_reminder_rules SET template_id = $3, template_version_id = $4, channel_id = $5,
          audience = $6, offset_minutes_before = $7, enabled = $8, updated_at = now()
        WHERE id = $1 AND event_id = $2
      `, [reminderId, eventId, templateId, resolved.versionId, channelId, config.props.audience, config.props.offsetMinutesBefore, config.props.enabled]);
      return { ok: true, value: await this.find(client, reminderId) };
    });
  }

  remove(principal: AuthenticatedPrincipal, eventId: string, reminderId: string): Promise<boolean | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canManageEvent(client, principal, eventId))) return null;
      const result = await client.query('DELETE FROM event_reminder_rules WHERE id = $1 AND event_id = $2', [reminderId, eventId]);
      return Boolean(result.rowCount);
    });
  }

  private async resolveInputs(client: PoolClient, principal: AuthenticatedPrincipal, eventId: string, templateId: string, channelId: string, eventAlreadyChecked = false): Promise<{ ok: true; versionId: string } | { ok: false; reason: 'event_not_found' | 'template_not_active' | 'channel_not_accessible' }> {
    if (!eventAlreadyChecked && !(await canManageEvent(client, principal, eventId))) return { ok: false, reason: 'event_not_found' };
    const template = await client.query<{ version_id: string }>(`
      SELECT versions.id AS version_id FROM communication_templates AS templates
      JOIN LATERAL (
        SELECT id FROM communication_template_versions WHERE template_id = templates.id ORDER BY version DESC LIMIT 1
      ) AS versions ON true
      WHERE templates.id = $1 AND templates.status = 'active' AND templates.channel = 'whatsapp'
    `, [templateId]);
    if (!template.rows[0]) return { ok: false, reason: 'template_not_active' };
    const channel = await client.query(`
      SELECT 1 FROM conversation_channels
      WHERE id = $1 AND status <> 'disconnected' AND ($2::boolean OR owner_user_id = $3)
    `, [channelId, canManageAllChannels(principal), principal.userId]);
    if (!channel.rowCount) return { ok: false, reason: 'channel_not_accessible' };
    return { ok: true, versionId: template.rows[0].version_id };
  }

  private async find(client: PoolClient, reminderId: string): Promise<EventReminderView> {
    const result = await client.query(reminderSelect('rules.id = $1'), [reminderId]);
    return mapReminder(result.rows[0]);
  }
}

function mapVersion(row: any): CommunicationTemplateVersionView {
  return { id: row.id, version: row.version, subject: row.subject, body: row.body, variables: row.variables, createdAt: row.created_at.toISOString(), createdBy: { id: row.created_by_user_id, name: row.creator_name } };
}

function mapTemplate(row: any): CommunicationTemplateView {
  return {
    id: row.id, name: row.name, purpose: row.purpose, channel: row.channel, status: row.status,
    currentVersion: { id: row.version_id, version: row.version, subject: row.subject, body: row.body, variables: row.variables, createdAt: row.version_created_at.toISOString(), createdBy: { id: row.version_creator_id, name: row.version_creator_name } },
    versionCount: row.version_count, updatedAt: row.updated_at.toISOString(),
  };
}

function reminderSelect(predicate: string) {
  return `
    SELECT rules.*, events.starts_at,
      templates.name AS template_name, templates.channel AS template_channel, templates.status AS template_status,
      versions.version AS template_version,
      (SELECT max(latest.version) FROM communication_template_versions AS latest WHERE latest.template_id = templates.id) AS latest_version,
      channels.display_name AS channel_name, channels.phone_number, channels.status AS channel_status
    FROM event_reminder_rules AS rules
    JOIN events ON events.id = rules.event_id AND events.tenant_id = rules.tenant_id
    JOIN communication_templates AS templates ON templates.id = rules.template_id AND templates.tenant_id = rules.tenant_id
    JOIN communication_template_versions AS versions
      ON versions.id = rules.template_version_id AND versions.template_id = rules.template_id AND versions.tenant_id = rules.tenant_id
    JOIN conversation_channels AS channels ON channels.id = rules.channel_id AND channels.tenant_id = rules.tenant_id
    WHERE ${predicate} ORDER BY rules.offset_minutes_before DESC, rules.created_at
  `;
}

function mapReminder(row: any): EventReminderView {
  return {
    id: row.id, eventId: row.event_id, audience: row.audience, offsetMinutesBefore: row.offset_minutes_before,
    enabled: row.enabled, scheduledFor: new Date(row.starts_at.getTime() - row.offset_minutes_before * 60_000).toISOString(),
    template: { id: row.template_id, name: row.template_name, versionId: row.template_version_id, version: row.template_version, latestVersion: row.latest_version, channel: row.template_channel, status: row.template_status },
    channel: { id: row.channel_id, displayName: row.channel_name, phoneNumber: row.phone_number, status: row.channel_status },
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}
