import type { MemberEventRepository, MemberEventsView } from '../../application/ports/event.port';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresMemberEventRepository implements MemberEventRepository {
  constructor(private readonly database: PostgresDatabase) {}

  listForMember(principal: AuthenticatedPrincipal): Promise<MemberEventsView> {
    return this.database.withTenant(principal, async (client) => {
      const community = await client.query<{ id: string; name: string }>(
        'SELECT id, name FROM tenants WHERE id = $1',
        [principal.tenantId],
      );
      const available = await client.query<{
          id: string;
          public_id: string;
          title: string;
          description: string;
          location: string;
          starts_at: Date;
          registration_deadline: Date | null;
          capacity: number | null;
          participant_count: string;
        }>(`
          SELECT events.id, events.public_id, events.title, events.description, events.location,
            events.starts_at, events.registration_deadline, events.capacity,
            count(confirmed.id)::text AS participant_count
          FROM events
          LEFT JOIN event_registration_participants AS participants
            ON participants.event_id = events.id
           AND participants.tenant_id = events.tenant_id
          LEFT JOIN event_registrations AS confirmed
            ON confirmed.id = participants.registration_id
           AND confirmed.event_id = participants.event_id
           AND confirmed.tenant_id = participants.tenant_id
           AND confirmed.status = 'confirmed'
          WHERE events.status = 'published'
            AND events.starts_at > now()
            AND (events.registration_deadline IS NULL OR events.registration_deadline >= now())
            AND NOT EXISTS (
              SELECT 1
              FROM event_registrations AS own_registration
              WHERE own_registration.event_id = events.id
                AND own_registration.tenant_id = events.tenant_id
                AND own_registration.user_id = $1
                AND own_registration.status = 'confirmed'
            )
          GROUP BY events.id
          ORDER BY events.starts_at, events.id
        `, [principal.userId]);
      const registered = await client.query<{
          registration_id: string;
          public_id: string;
          title: string;
          description: string;
          location: string;
          starts_at: Date;
          event_status: MemberEventsView['registered'][number]['eventStatus'];
          registered_at: Date;
          participants: MemberEventsView['registered'][number]['participants'];
          offerings: MemberEventsView['registered'][number]['offerings'];
          pix_payment_declared_at: Date | null;
        }>(`
          SELECT registrations.id AS registration_id, events.public_id, events.title,
            events.description, events.location, events.starts_at, events.status AS event_status,
            registrations.created_at AS registered_at, registrations.pix_payment_declared_at,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', participants.id,
                'name', participants.name,
                'sourceType', participants.source_type
              ) ORDER BY participants.position, participants.id)
              FROM event_registration_participants AS participants
              WHERE participants.registration_id = registrations.id
                AND participants.event_id = registrations.event_id
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
                AND selections.event_id = registrations.event_id
                AND selections.tenant_id = registrations.tenant_id
            ), '[]'::jsonb) AS offerings
          FROM event_registrations AS registrations
          JOIN events
            ON events.id = registrations.event_id
           AND events.tenant_id = registrations.tenant_id
          WHERE registrations.user_id = $1
            AND registrations.status = 'confirmed'
          ORDER BY events.starts_at DESC, registrations.id DESC
        `, [principal.userId]);

      const tenant = community.rows[0];
      if (!tenant) throw new Error('Comunidade da sessão não encontrada.');
      return {
        community: tenant,
        available: available.rows.map((event) => ({
          id: event.id,
          publicId: event.public_id,
          title: event.title,
          description: event.description,
          location: event.location,
          startsAt: event.starts_at.toISOString(),
          registrationDeadline: event.registration_deadline?.toISOString() ?? null,
          capacity: event.capacity,
          participantCount: Number(event.participant_count),
        })),
        registered: registered.rows.map((event) => ({
          registrationId: event.registration_id,
          publicId: event.public_id,
          title: event.title,
          description: event.description,
          location: event.location,
          startsAt: event.starts_at.toISOString(),
          eventStatus: event.event_status,
          registeredAt: event.registered_at.toISOString(),
          participants: event.participants,
          offerings: event.offerings,
          pixPaymentDeclaredAt: event.pix_payment_declared_at?.toISOString() ?? null,
        })),
      };
    });
  }
}
