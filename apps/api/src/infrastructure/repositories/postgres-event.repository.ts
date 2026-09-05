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
  created_by_user_id: string;
  owner_name: string;
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
      const events = await this.queryEvents(client, principal);
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
      const events = await this.queryEvents(client, principal);
      return events.rows.map(this.mapEvent);
    });
  }

  findById(principal: AuthenticatedPrincipal, eventId: string): Promise<ManagedEventView | null> {
    return this.database.withTenant(principal, async (client) => {
      const event = await this.queryEvent(client, eventId, principal);
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
      const collaborators = await client.query<{ id: string; name: string; email: string }>(`
        SELECT users.id, users.name, users.email
        FROM event_collaborators
        JOIN users ON users.id = event_collaborators.user_id AND users.tenant_id = event_collaborators.tenant_id
        WHERE event_collaborators.event_id = $1
        ORDER BY users.name
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
        collaborators: collaborators.rows,
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
          '0'::text AS registrations, '0'::text AS attendance,
          created_by_user_id, ''::text AS owner_name
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
      return { ...this.mapEvent(event), owner: { id: principal.userId, name: principal.name } };
    });
  }

  update(principal: AuthenticatedPrincipal, eventId: string, draft: EventDraft): Promise<DashboardEvent> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canManageEvent(client, principal, eventId))) throw new NotFoundError('Evento não encontrado ou sem acesso para editar.');
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
      const event = await this.queryEvent(client, eventId, principal);
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

  async setCollaborators(principal: AuthenticatedPrincipal, eventId: string, userIds: string[]): Promise<ManagedEventView | null> {
    const updated = await this.database.withTenant(principal, async (client) => {
      const event = await client.query<{ created_by_user_id: string }>('SELECT created_by_user_id FROM events WHERE id = $1', [eventId]);
      if (!event.rows[0]) return false;
      const mayShare = event.rows[0].created_by_user_id === principal.userId || principal.permissions.includes('events.manage_all');
      if (!mayShare) return false;
      const users = await client.query<{ id: string }>('SELECT id FROM users WHERE id = ANY($1::uuid[])', [userIds]);
      if (users.rowCount !== userIds.length) throw new ConflictError('Um ou mais colaboradores não pertencem à comunidade.');
      await client.query('DELETE FROM event_collaborators WHERE event_id = $1', [eventId]);
      for (const userId of userIds.filter((id) => id !== event.rows[0]!.created_by_user_id)) {
        await client.query(`
          INSERT INTO event_collaborators (tenant_id, event_id, user_id, added_by_user_id)
          VALUES ($1, $2, $3, $4)
        `, [principal.tenantId, eventId, userId, principal.userId]);
      }
      return true;
    });
    return updated ? this.findById(principal, eventId) : null;
  }

  listCollaboratorCandidates(principal: AuthenticatedPrincipal, eventId: string): Promise<Array<{ id: string; name: string; email: string }> | null> {
    return this.database.withTenant(principal, async (client) => {
      const event = await client.query<{ created_by_user_id: string }>('SELECT created_by_user_id FROM events WHERE id = $1', [eventId]);
      if (!event.rows[0]) return null;
      if (event.rows[0].created_by_user_id !== principal.userId && !principal.permissions.includes('events.manage_all')) return null;
      const result = await client.query<{ id: string; name: string; email: string }>(`
        SELECT DISTINCT users.id, users.name, users.email
        FROM users
        JOIN user_roles ON user_roles.user_id = users.id AND user_roles.tenant_id = users.tenant_id
        JOIN role_permissions ON role_permissions.role_id = user_roles.role_id AND role_permissions.tenant_id = users.tenant_id
        WHERE role_permissions.permission_key IN ('events.read', 'events.update')
          AND users.id <> $1
        ORDER BY users.name, users.id
      `, [event.rows[0].created_by_user_id]);
      return result.rows;
    });
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
      if (!(await this.canManageEvent(client, principal, eventId))) return null;
      const current = await this.queryEvent(client, eventId, principal);
      if (!current) return null;
      if (current.status === target) return this.mapEvent(current);
      if (!allowed.includes(current.status)) throw new ConflictError(invalidMessage);
      await client.query('UPDATE events SET status = $2, updated_at = now() WHERE id = $1', [eventId, target]);
      const event = await this.queryEvent(client, eventId, principal);
      return event ? this.mapEvent(event) : null;
    });
  }

  private queryEvents(client: PoolClient, principal: AuthenticatedPrincipal) {
    return client.query<EventRow>(`
      SELECT events.id, events.public_id, events.title, events.starts_at,
        events.registration_deadline, events.location, events.status, events.capacity,
        count(DISTINCT registrations.id)::text AS registrations,
        count(DISTINCT check_ins.id)::text AS attendance,
        events.created_by_user_id, owners.name AS owner_name
      FROM events
      JOIN users AS owners ON owners.id = events.created_by_user_id AND owners.tenant_id = events.tenant_id
      LEFT JOIN event_registrations AS registrations
        ON registrations.event_id = events.id AND registrations.status = 'confirmed'
      LEFT JOIN event_check_ins AS check_ins
        ON check_ins.event_id = events.id
      WHERE $1::boolean
         OR events.created_by_user_id = $2
         OR EXISTS (
           SELECT 1 FROM event_collaborators
           WHERE event_collaborators.event_id = events.id
             AND event_collaborators.user_id = $2
         )
      GROUP BY events.id, owners.name
      ORDER BY events.starts_at ASC
    `, [principal.permissions.includes('events.read_all'), principal.userId]);
  }

  private async queryEvent(client: PoolClient, eventId: string, principal: AuthenticatedPrincipal): Promise<ManagedEventRow | null> {
    const result = await client.query<ManagedEventRow>(`
      SELECT events.id, events.public_id, events.title, events.description, events.starts_at,
        events.registration_deadline, events.location, events.status, events.capacity,
        events.media_display_mode, events.current_form_version,
        count(DISTINCT registrations.id)::text AS registrations,
        count(DISTINCT check_ins.id)::text AS attendance,
        events.created_by_user_id, owners.name AS owner_name
      FROM events
      JOIN users AS owners ON owners.id = events.created_by_user_id AND owners.tenant_id = events.tenant_id
      LEFT JOIN event_registrations AS registrations
        ON registrations.event_id = events.id AND registrations.status = 'confirmed'
      LEFT JOIN event_check_ins AS check_ins
        ON check_ins.event_id = events.id
      WHERE events.id = $1
        AND ($2::boolean OR events.created_by_user_id = $3 OR EXISTS (
          SELECT 1 FROM event_collaborators
          WHERE event_collaborators.event_id = events.id AND event_collaborators.user_id = $3
        ))
      GROUP BY events.id, owners.name
    `, [eventId, principal.permissions.includes('events.read_all') || principal.permissions.includes('events.manage_all'), principal.userId]);
    return result.rows[0] ?? null;
  }

  private async canManageEvent(client: PoolClient, principal: AuthenticatedPrincipal, eventId: string): Promise<boolean> {
    const result = await client.query(`
      SELECT 1 FROM events
      WHERE id = $1 AND ($2::boolean OR created_by_user_id = $3 OR EXISTS (
        SELECT 1 FROM event_collaborators
        WHERE event_collaborators.event_id = events.id AND event_collaborators.user_id = $3
      ))
    `, [eventId, principal.permissions.includes('events.manage_all'), principal.userId]);
    return Boolean(result.rowCount);
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
      owner: { id: row.created_by_user_id, name: row.owner_name },
    };
  }
}
