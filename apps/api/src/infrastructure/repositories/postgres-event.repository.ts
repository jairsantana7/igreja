import type { PoolClient } from 'pg';
import type { EventRepository, DashboardEvent, DashboardView, ManagedEventView, PublicEventView } from '../../application/ports/event.port';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { isRegistrationOpen, slugify, type EventDraft, type EventMediaDisplayMode, type FormFieldType } from '../../domain/entities/event';
import { ConflictError, NotFoundError } from '../../application/use-cases/errors';
import { PostgresDatabase } from '../database/postgres.database';

interface EventRow {
  id: string;
  public_id: string;
  title: string;
  starts_at: Date;
  registration_deadline: Date | null;
  location: string;
  status: DashboardEvent['status'];
  capacity: number | null;
  registrations: string;
  attendance: string;
}

interface ManagedEventRow extends EventRow {
  description: string;
  media_display_mode: EventMediaDisplayMode;
  current_form_version: number;
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly database: PostgresDatabase) {}

  dashboard(principal: AuthenticatedPrincipal): Promise<DashboardView> {
    return this.database.withTenant(principal, async (client) => {
      const tenant = await client.query<{ id: string; name: string }>('SELECT id, name FROM tenants LIMIT 1');
      const events = await this.queryEvents(client);
      const community = tenant.rows[0];
      if (!community) throw new Error('Comunidade não encontrada.');
      return {
        community,
        user: {
          userId: principal.userId,
          name: principal.name,
          email: principal.email,
          roles: principal.roles,
          permissions: principal.permissions,
        },
        events: events.rows.map(this.mapEvent),
      };
    });
  }

  list(principal: AuthenticatedPrincipal): Promise<DashboardEvent[]> {
    return this.database.withTenant(principal, async (client) => {
      const events = await this.queryEvents(client);
      return events.rows.map(this.mapEvent);
    });
  }

  findById(principal: AuthenticatedPrincipal, eventId: string): Promise<ManagedEventView | null> {
    return this.database.withTenant(principal, async (client) => {
      const event = await this.queryEvent(client, eventId);
      if (!event) return null;
      const fields = await client.query<{
        id: string;
        field_key: string;
        label: string;
        type: FormFieldType;
        required: boolean;
        options: string[];
      }>(`
        SELECT id, field_key, label, type, required, options
        FROM event_form_fields
        WHERE event_id = $1
        ORDER BY position
      `, [eventId]);
      return {
        ...this.mapEvent(event),
        description: event.description,
        mediaDisplayMode: event.media_display_mode,
        currentFormVersion: event.current_form_version,
        fields: fields.rows.map((field) => ({
          id: field.id,
          key: field.field_key,
          label: field.label,
          type: field.type,
          required: field.required,
          options: field.options,
        })),
      };
    });
  }

  create(principal: AuthenticatedPrincipal, draft: EventDraft): Promise<DashboardEvent> {
    return this.database.withTenant(principal, async (client) => {
      const baseSlug = slugify(draft.props.title) || 'evento';
      const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
      const eventResult = await client.query<EventRow>(`
        INSERT INTO events (
          tenant_id, created_by_user_id, slug, title, description, location,
          starts_at, registration_deadline, capacity, media_display_mode, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, public_id, title, starts_at, registration_deadline, location, status, capacity,
          '0'::text AS registrations, '0'::text AS attendance
      `, [
        principal.tenantId,
        principal.userId,
        slug,
        draft.props.title,
        draft.props.description,
        draft.props.location,
        draft.props.startsAt,
        draft.props.registrationDeadline ?? null,
        draft.props.capacity ?? null,
        draft.props.mediaDisplayMode,
        draft.props.publish ? 'published' : 'draft',
      ]);
      const event = eventResult.rows[0];
      if (!event) throw new Error('Falha ao criar evento.');
      await client.query('SELECT app.register_public_event($1, $2, $3)', [event.public_id, principal.tenantId, event.id]);
      await this.insertFields(client, principal.tenantId, event.id, draft);
      await this.snapshotForm(client, principal.tenantId, principal.userId, event.id, 1);
      return this.mapEvent(event);
    });
  }

  update(principal: AuthenticatedPrincipal, eventId: string, draft: EventDraft): Promise<DashboardEvent> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        UPDATE events SET
          title = $2,
          description = $3,
          location = $4,
          starts_at = $5,
          registration_deadline = $6,
          capacity = $7,
          media_display_mode = $8,
          updated_at = now()
        WHERE id = $1
        RETURNING id
      `, [
        eventId,
        draft.props.title,
        draft.props.description,
        draft.props.location,
        draft.props.startsAt,
        draft.props.registrationDeadline ?? null,
        draft.props.capacity ?? null,
        draft.props.mediaDisplayMode,
      ]);
      if (!result.rows[0]) throw new NotFoundError('Evento não encontrado nesta comunidade.');
      await this.upsertFields(client, principal.tenantId, eventId, draft);
      const version = await client.query<{ current_form_version: number }>(`
        UPDATE events SET current_form_version = current_form_version + 1
        WHERE id = $1 RETURNING current_form_version
      `, [eventId]);
      await this.snapshotForm(client, principal.tenantId, principal.userId, eventId, version.rows[0]!.current_form_version);
      const event = await this.queryEvent(client, eventId);
      if (!event) throw new NotFoundError('Evento não encontrado nesta comunidade.');
      return this.mapEvent(event);
    });
  }

  cancel(principal: AuthenticatedPrincipal, eventId: string): Promise<DashboardEvent | null> {
    return this.changeStatus(principal, eventId, 'cancelled', ['draft', 'published', 'registration_closed'], 'Um evento concluído não pode ser cancelado.');
  }

  closeRegistrations(principal: AuthenticatedPrincipal, eventId: string): Promise<DashboardEvent | null> {
    return this.changeStatus(principal, eventId, 'registration_closed', ['published'], 'Somente um evento publicado pode ter as inscrições fechadas.');
  }

  complete(principal: AuthenticatedPrincipal, eventId: string): Promise<DashboardEvent | null> {
    return this.changeStatus(principal, eventId, 'completed', ['published', 'registration_closed'], 'Somente um evento publicado ou com inscrições fechadas pode ser concluído.');
  }

  async findPublic(publicId: string): Promise<PublicEventView | null> {
    const result = await this.database.queryPublic<{ event: PublicEventView | null }>(
      'SELECT app.resolve_public_event($1::uuid) AS event',
      [publicId],
    );
    return result.rows[0]?.event ?? null;
  }

  private async insertFields(client: PoolClient, tenantId: string, eventId: string, draft: EventDraft) {
    for (const [position, field] of draft.props.fields.entries()) {
      await client.query(`
        INSERT INTO event_form_fields (tenant_id, event_id, field_key, label, type, required, options, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `, [tenantId, eventId, field.key, field.label, field.type, field.required, JSON.stringify(field.options), position]);
    }
  }

  private async upsertFields(client: PoolClient, tenantId: string, eventId: string, draft: EventDraft) {
    try {
      await client.query(`
        DELETE FROM event_form_fields
        WHERE event_id = $1
          AND NOT (field_key = ANY($2::text[]))
      `, [eventId, draft.props.fields.map((field) => field.key)]);
    } catch (error: any) {
      if (error?.code === '23503') throw new ConflictError('Não é possível remover um campo que já possui respostas.');
      throw error;
    }
    await client.query('UPDATE event_form_fields SET position = position + 1000000 WHERE event_id = $1', [eventId]);
    for (const [position, field] of draft.props.fields.entries()) {
      await client.query(`
        INSERT INTO event_form_fields (tenant_id, event_id, field_key, label, type, required, options, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (event_id, field_key) DO UPDATE SET
          label = EXCLUDED.label,
          type = EXCLUDED.type,
          required = EXCLUDED.required,
          options = EXCLUDED.options,
          position = EXCLUDED.position
      `, [tenantId, eventId, field.key, field.label, field.type, field.required, JSON.stringify(field.options), position]);
    }
  }

  private async snapshotForm(client: PoolClient, tenantId: string, userId: string, eventId: string, version: number) {
    await client.query(`
      INSERT INTO event_form_versions (tenant_id, event_id, version, schema_snapshot, created_by_user_id)
      SELECT $1, $2, $3, COALESCE(jsonb_agg(jsonb_build_object(
        'id', fields.id, 'key', fields.field_key, 'label', fields.label, 'type', fields.type,
        'required', fields.required, 'options', fields.options
      ) ORDER BY fields.position) FILTER (WHERE fields.id IS NOT NULL), '[]'::jsonb), $4
      FROM event_form_fields AS fields
      WHERE fields.event_id = $2
    `, [tenantId, eventId, version, userId]);
  }

  private changeStatus(
    principal: AuthenticatedPrincipal,
    eventId: string,
    target: DashboardEvent['status'],
    allowed: DashboardEvent['status'][],
    invalidMessage: string,
  ): Promise<DashboardEvent | null> {
    return this.database.withTenant(principal, async (client) => {
      const current = await this.queryEvent(client, eventId);
      if (!current) return null;
      if (current.status === target) return this.mapEvent(current);
      if (!allowed.includes(current.status)) throw new ConflictError(invalidMessage);
      await client.query('UPDATE events SET status = $2, updated_at = now() WHERE id = $1', [eventId, target]);
      const event = await this.queryEvent(client, eventId);
      return event ? this.mapEvent(event) : null;
    });
  }

  private queryEvents(client: PoolClient) {
    return client.query<EventRow>(`
      SELECT events.id, events.public_id, events.title, events.starts_at,
        events.registration_deadline, events.location, events.status, events.capacity,
        count(DISTINCT registrations.id)::text AS registrations,
        count(DISTINCT check_ins.id)::text AS attendance
      FROM events
      LEFT JOIN event_registrations AS registrations
        ON registrations.event_id = events.id AND registrations.status = 'confirmed'
      LEFT JOIN event_check_ins AS check_ins
        ON check_ins.event_id = events.id
      GROUP BY events.id
      ORDER BY events.starts_at ASC
    `);
  }

  private async queryEvent(client: PoolClient, eventId: string): Promise<ManagedEventRow | null> {
    const result = await client.query<ManagedEventRow>(`
      SELECT events.id, events.public_id, events.title, events.description, events.starts_at,
        events.registration_deadline, events.location, events.status, events.capacity,
        events.media_display_mode, events.current_form_version,
        count(DISTINCT registrations.id)::text AS registrations,
        count(DISTINCT check_ins.id)::text AS attendance
      FROM events
      LEFT JOIN event_registrations AS registrations
        ON registrations.event_id = events.id AND registrations.status = 'confirmed'
      LEFT JOIN event_check_ins AS check_ins
        ON check_ins.event_id = events.id
      WHERE events.id = $1
      GROUP BY events.id
    `, [eventId]);
    return result.rows[0] ?? null;
  }

  private mapEvent(row: EventRow): DashboardEvent {
    return {
      id: row.id,
      publicId: row.public_id,
      title: row.title,
      startsAt: row.starts_at.toISOString(),
      registrationDeadline: row.registration_deadline?.toISOString() ?? null,
      location: row.location,
      status: row.status,
      registrationOpen: isRegistrationOpen({
        status: row.status,
        startsAt: row.starts_at,
        registrationDeadline: row.registration_deadline,
      }),
      capacity: row.capacity,
      registrations: Number(row.registrations),
      attendance: Number(row.attendance),
    };
  }
}
