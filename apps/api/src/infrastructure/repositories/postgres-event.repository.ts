import type { PoolClient } from 'pg';
import type { EventRepository, DashboardEvent, DashboardView, PublicEventView } from '../../application/ports/event.port';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { isRegistrationOpen, slugify, type EventDraft } from '../../domain/entities/event';
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
          '0'::text AS registrations
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
      return this.mapEvent(event);
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

  private queryEvents(client: PoolClient) {
    return client.query<EventRow>(`
      SELECT events.id, events.public_id, events.title, events.starts_at,
        events.registration_deadline, events.location, events.status, events.capacity,
        count(registrations.id)::text AS registrations
      FROM events
      LEFT JOIN event_registrations AS registrations
        ON registrations.event_id = events.id AND registrations.status = 'confirmed'
      GROUP BY events.id
      ORDER BY events.starts_at ASC
    `);
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
    };
  }
}
