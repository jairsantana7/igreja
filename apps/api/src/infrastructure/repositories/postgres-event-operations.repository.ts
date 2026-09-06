import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type {
  CheckInView,
  EventCommunicationRepository,
  EventCommunicationView,
  EventOperationsRepository,
  EventTemplateRepository,
  EventTemplateView,
  ManagedRegistrationView,
  ParticipantCheckInView,
} from '../../application/ports/event-operations.port';
import { PostgresDatabase } from '../database/postgres.database';
import type { PoolClient } from 'pg';

async function canAccessEvent(client: PoolClient, principal: AuthenticatedPrincipal, eventId: string, manage = false): Promise<boolean> {
  const globalPermission = manage ? 'events.manage_all' : 'events.read_all';
  const result = await client.query(`
    SELECT 1 FROM events
    WHERE id = $1 AND ($2::boolean OR created_by_user_id = $3 OR EXISTS (
      SELECT 1 FROM event_collaborators
      WHERE event_collaborators.event_id = events.id AND event_collaborators.user_id = $3
    ))
  `, [eventId, principal.permissions.includes(globalPermission), principal.userId]);
  return Boolean(result.rowCount);
}

export class PostgresEventOperationsRepository implements EventOperationsRepository {
  constructor(private readonly database: PostgresDatabase) {}

  listRegistrations(principal: AuthenticatedPrincipal, eventId: string): Promise<ManagedRegistrationView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId))) return null;
      const result = await client.query<{
        id: string; user_id: string; name: string; email: string; status: 'confirmed' | 'cancelled';
        form_version: number; created_at: Date; checked_in_at: Date | null; checked_in_by: string | null;
        answers: Array<{ fieldId: string; label: string; value: unknown }>;
        participants: Array<{ id: string; name: string; sourceType: 'registrant' | 'spouse' | 'child'; checkedInAt: string | null; checkedInBy: string | null }>;
        offerings: Array<{ id: string; name: string; priceCents: number }>;
      }>(`
        SELECT registrations.id, users.id AS user_id, users.name, users.email, registrations.status,
          registrations.form_version, registrations.created_at, check_ins.checked_in_at,
          operators.name AS checked_in_by,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', participants.id,
              'name', participants.name,
              'sourceType', participants.source_type,
              'checkedInAt', participants.checked_in_at,
              'checkedInBy', participant_operators.name
            ) ORDER BY participants.position, participants.id)
            FROM event_registration_participants AS participants
            LEFT JOIN users AS participant_operators
              ON participant_operators.id = participants.checked_in_by_user_id
             AND participant_operators.tenant_id = participants.tenant_id
            WHERE participants.registration_id = registrations.id
              AND participants.tenant_id = registrations.tenant_id
          ), '[]'::jsonb) AS participants,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', offerings.id,
              'name', offerings.name,
              'priceCents', offerings.price_cents
            ) ORDER BY offerings.position, offerings.id)
            FROM registration_offering_selections AS selections
            JOIN event_offerings AS offerings
              ON offerings.id = selections.offering_id
             AND offerings.event_id = selections.event_id
             AND offerings.tenant_id = selections.tenant_id
            WHERE selections.registration_id = registrations.id
              AND selections.tenant_id = registrations.tenant_id
          ), '[]'::jsonb) AS offerings,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'fieldId', answers.field_id,
              'label', fields.label,
              'value', answers.value
            ) ORDER BY fields.position)
            FROM registration_answers AS answers
            JOIN event_form_fields AS fields
              ON fields.id = answers.field_id
             AND fields.event_id = answers.event_id
             AND fields.tenant_id = answers.tenant_id
            WHERE answers.registration_id = registrations.id
              AND answers.tenant_id = registrations.tenant_id
          ), '[]'::jsonb) AS answers
        FROM event_registrations AS registrations
        JOIN users ON users.id = registrations.user_id AND users.tenant_id = registrations.tenant_id
        LEFT JOIN event_check_ins AS check_ins
          ON check_ins.registration_id = registrations.id
         AND check_ins.event_id = registrations.event_id
         AND check_ins.tenant_id = registrations.tenant_id
        LEFT JOIN users AS operators
          ON operators.id = check_ins.checked_in_by_user_id
         AND operators.tenant_id = check_ins.tenant_id
        WHERE registrations.event_id = $1
        ORDER BY registrations.created_at ASC
      `, [eventId]);
      return result.rows.map((row) => ({
        id: row.id,
        member: { id: row.user_id, name: row.name, email: row.email },
        status: row.status,
        formVersion: row.form_version,
        registeredAt: row.created_at.toISOString(),
        checkedInAt: row.checked_in_at?.toISOString() ?? null,
        checkedInBy: row.checked_in_by,
        participants: row.participants,
        offerings: row.offerings,
        answers: row.answers,
      }));
    });
  }

  checkIn(principal: AuthenticatedPrincipal, eventId: string, registrationId: string): Promise<CheckInView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId, true))) return null;
      const registration = await client.query(`
        SELECT 1 FROM event_registrations
        WHERE id = $1 AND event_id = $2 AND status = 'confirmed'
      `, [registrationId, eventId]);
      if (!registration.rowCount) return null;
      const result = await client.query<{ registration_id: string; checked_in_at: Date }>(`
        INSERT INTO event_check_ins (tenant_id, event_id, registration_id, checked_in_by_user_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (registration_id, event_id, tenant_id) DO UPDATE
          SET checked_in_at = event_check_ins.checked_in_at
        RETURNING registration_id, checked_in_at
      `, [principal.tenantId, eventId, registrationId, principal.userId]);
      await client.query(`
        UPDATE event_registration_participants
        SET checked_in_by_user_id = $3, checked_in_at = $4, updated_at = now()
        WHERE registration_id = $1 AND event_id = $2 AND checked_in_at IS NULL
      `, [registrationId, eventId, principal.userId, result.rows[0]!.checked_in_at]);
      return {
        registrationId: result.rows[0]!.registration_id,
        checkedInAt: result.rows[0]!.checked_in_at.toISOString(),
        checkedInBy: principal.name,
      };
    });
  }

  undoCheckIn(principal: AuthenticatedPrincipal, eventId: string, registrationId: string): Promise<boolean | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId, true))) return null;
      const registration = await client.query('SELECT 1 FROM event_registrations WHERE id = $1 AND event_id = $2', [registrationId, eventId]);
      if (!registration.rowCount) return null;
      const result = await client.query('DELETE FROM event_check_ins WHERE registration_id = $1 AND event_id = $2', [registrationId, eventId]);
      await client.query(`
        UPDATE event_registration_participants
        SET checked_in_by_user_id = NULL, checked_in_at = NULL, updated_at = now()
        WHERE registration_id = $1 AND event_id = $2
      `, [registrationId, eventId]);
      return Boolean(result.rowCount);
    });
  }

  checkInParticipant(
    principal: AuthenticatedPrincipal,
    eventId: string,
    registrationId: string,
    participantId: string,
  ): Promise<ParticipantCheckInView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId, true))) return null;
      const result = await client.query<{ id: string; checked_in_at: Date }>(`
        UPDATE event_registration_participants AS participants
        SET checked_in_by_user_id = COALESCE(participants.checked_in_by_user_id, $4),
            checked_in_at = COALESCE(participants.checked_in_at, now()),
            updated_at = now()
        FROM event_registrations AS registrations
        WHERE participants.id = $1
          AND participants.registration_id = $2
          AND participants.event_id = $3
          AND registrations.id = participants.registration_id
          AND registrations.event_id = participants.event_id
          AND registrations.tenant_id = participants.tenant_id
          AND registrations.status = 'confirmed'
        RETURNING participants.id, participants.checked_in_at
      `, [participantId, registrationId, eventId, principal.userId]);
      if (!result.rows[0]) return null;
      const pending = await client.query(`
        SELECT 1 FROM event_registration_participants
        WHERE registration_id = $1 AND event_id = $2 AND checked_in_at IS NULL
        LIMIT 1
      `, [registrationId, eventId]);
      if (!pending.rowCount) {
        await client.query(`
          INSERT INTO event_check_ins (tenant_id, event_id, registration_id, checked_in_by_user_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (registration_id, event_id, tenant_id) DO NOTHING
        `, [principal.tenantId, eventId, registrationId, principal.userId]);
      }
      return {
        participantId: result.rows[0].id,
        checkedInAt: result.rows[0].checked_in_at.toISOString(),
        checkedInBy: principal.name,
      };
    });
  }

  undoParticipantCheckIn(
    principal: AuthenticatedPrincipal,
    eventId: string,
    registrationId: string,
    participantId: string,
  ): Promise<ParticipantCheckInView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId, true))) return null;
      const result = await client.query<{ id: string }>(`
        UPDATE event_registration_participants AS participants
        SET checked_in_by_user_id = NULL, checked_in_at = NULL, updated_at = now()
        FROM event_registrations AS registrations
        WHERE participants.id = $1
          AND participants.registration_id = $2
          AND participants.event_id = $3
          AND registrations.id = participants.registration_id
          AND registrations.event_id = participants.event_id
          AND registrations.tenant_id = participants.tenant_id
        RETURNING participants.id
      `, [participantId, registrationId, eventId]);
      if (!result.rows[0]) return null;
      await client.query(
        'DELETE FROM event_check_ins WHERE registration_id = $1 AND event_id = $2',
        [registrationId, eventId],
      );
      return { participantId: result.rows[0].id, checkedInAt: null, checkedInBy: null };
    });
  }
}

export class PostgresEventCommunicationRepository implements EventCommunicationRepository {
  constructor(private readonly database: PostgresDatabase) {}

  list(principal: AuthenticatedPrincipal, eventId: string): Promise<EventCommunicationView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId))) return null;
      const result = await client.query('SELECT * FROM event_communications WHERE event_id = $1 ORDER BY created_at DESC', [eventId]);
      return result.rows.map(this.map);
    });
  }

  create(principal: AuthenticatedPrincipal, eventId: string, input: Parameters<EventCommunicationRepository['create']>[2]): Promise<EventCommunicationView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId, true))) return null;
      const result = await client.query(`
        INSERT INTO event_communications (tenant_id, event_id, created_by_user_id, audience, channel, subject, message)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [principal.tenantId, eventId, principal.userId, input.audience, input.channel, input.subject.trim(), input.message.trim()]);
      return this.map(result.rows[0]);
    });
  }

  find(principal: AuthenticatedPrincipal, eventId: string, communicationId: string): Promise<EventCommunicationView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId))) return null;
      const result = await client.query('SELECT * FROM event_communications WHERE id = $1 AND event_id = $2', [communicationId, eventId]);
      return result.rows[0] ? this.map(result.rows[0]) : null;
    });
  }

  markQueued(principal: AuthenticatedPrincipal, eventId: string, communicationId: string, jobId: string): Promise<EventCommunicationView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId, true))) return null;
      const result = await client.query(`
        UPDATE event_communications SET status = 'queued', queue_job_id = $3, queued_at = now()
        WHERE id = $1 AND event_id = $2 AND status = 'draft'
        RETURNING *
      `, [communicationId, eventId, jobId]);
      return result.rows[0] ? this.map(result.rows[0]) : null;
    });
  }

  private map(row: any): EventCommunicationView {
    return {
      id: row.id,
      eventId: row.event_id,
      audience: row.audience,
      channel: row.channel,
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      queuedAt: row.queued_at?.toISOString() ?? null,
    };
  }
}

export class PostgresEventTemplateRepository implements EventTemplateRepository {
  constructor(private readonly database: PostgresDatabase) {}

  list(principal: AuthenticatedPrincipal): Promise<EventTemplateView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query('SELECT * FROM event_templates ORDER BY name');
      return result.rows.map(this.map);
    });
  }

  createFromEvent(principal: AuthenticatedPrincipal, eventId: string, name: string): Promise<EventTemplateView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await canAccessEvent(client, principal, eventId, true))) return null;
      const event = await client.query(`
        SELECT description, location, capacity, media_display_mode,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'key', fields.field_key, 'label', fields.label, 'type', fields.type,
              'required', fields.required, 'options', fields.options
            ) ORDER BY fields.position)
            FROM event_form_fields AS fields
            WHERE fields.event_id = events.id AND fields.tenant_id = events.tenant_id
          ), '[]'::jsonb) AS form_schema
        FROM events WHERE id = $1
      `, [eventId]);
      if (!event.rows[0]) return null;
      const source = event.rows[0];
      const result = await client.query(`
        INSERT INTO event_templates (
          tenant_id, created_by_user_id, name, description, location, capacity, media_display_mode, form_schema
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, name) DO UPDATE SET
          description = EXCLUDED.description, location = EXCLUDED.location, capacity = EXCLUDED.capacity,
          media_display_mode = EXCLUDED.media_display_mode, form_schema = EXCLUDED.form_schema, updated_at = now()
        RETURNING *
      `, [principal.tenantId, principal.userId, name, source.description, source.location, source.capacity, source.media_display_mode, JSON.stringify(source.form_schema)]);
      return this.map(result.rows[0]);
    });
  }

  private map(row: any): EventTemplateView {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      location: row.location,
      capacity: row.capacity,
      mediaDisplayMode: row.media_display_mode,
      fields: row.form_schema,
      createdAt: row.created_at.toISOString(),
    };
  }
}
