import type { PoolClient } from 'pg';
import type {
  EventRegistrationRepository,
  PublicEventView,
  RegistrationAnswerInput,
  RegistrationContextView,
} from '../../application/ports/event.port';
import type { LoginIdentity } from '../../application/ports/authentication.port';
import type { Permission } from '../../domain/entities/permission';
import type { RegistrationParticipantSnapshot } from '../../domain/entities/event-registration';
import type { MemberProfileDraft } from '../../domain/entities/member-profile';
import { ConflictError } from '../../application/use-cases/errors';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresRegistrationRepository implements EventRegistrationRepository {
  constructor(private readonly database: PostgresDatabase) {}

  signUpAndRegister(input: Parameters<EventRegistrationRepository['signUpAndRegister']>[0]) {
    return this.database.withTenant(input.event.tenantId, async (client) => {
      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
      if (existing.rowCount) throw new ConflictError('Já existe uma conta com este e-mail. Entre para continuar.');

      const user = await client.query<{ id: string }>(`
        INSERT INTO users (tenant_id, name, email, password_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [input.event.tenantId, input.name, input.email, input.passwordHash]);
      const userId = user.rows[0]!.id;
      await client.query("SELECT set_config('app.actor_user_id', $1, true)", [userId]);
      const memberRole = await client.query<{ id: string }>("SELECT id FROM roles WHERE key = 'member' LIMIT 1");
      if (!memberRole.rows[0]) throw new Error('O papel padrão de membro não está configurado.');
      await client.query('INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)', [
        input.event.tenantId,
        userId,
        memberRole.rows[0].id,
      ]);
      if (input.profile) await this.saveProfile(client, input.event.tenantId, userId, input.profile);
      const registrationId = await this.persistRegistration(
        client, input.event, userId, input.answers, input.participants, input.offeringIds,
      );
      return {
        identity: await this.loadIdentity(client, input.event.tenantId, userId),
        registrationId,
      };
    });
  }

  register(input: Parameters<EventRegistrationRepository['register']>[0]) {
    return this.database.withTenant(input.principal, async (client) => {
      if (input.profile) await this.saveProfile(client, input.principal.tenantId, input.principal.userId, input.profile);
      return this.persistRegistration(
        client, input.event, input.principal.userId, input.answers, input.participants, input.offeringIds,
      );
    });
  }

  context(principal: Parameters<EventRegistrationRepository['context']>[0], event: PublicEventView) {
    return this.database.withTenant(principal, async (client): Promise<RegistrationContextView> => {
      const profileResult = await client.query<{
        phone: string | null;
        birth_date: string | null;
        spouse_name: string | null;
        marriage_date: string | null;
        children: Array<{ name: string; birthDate: string | null }>;
      }>(`
        SELECT profiles.phone,
          to_char(profiles.birth_date, 'YYYY-MM-DD') AS birth_date,
          profiles.spouse_name,
          to_char(profiles.marriage_date, 'YYYY-MM-DD') AS marriage_date,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'name', children.name,
              'birthDate', to_char(children.birth_date, 'YYYY-MM-DD')
            ) ORDER BY children.created_at, children.id)
            FROM member_children AS children
            WHERE children.profile_id = profiles.id
              AND children.member_user_id = profiles.user_id
          ), '[]'::jsonb) AS children
        FROM member_profiles AS profiles
        WHERE profiles.user_id = $1
      `, [principal.userId]);
      const row = profileResult.rows[0];
      const profile = {
        phone: row?.phone ?? null,
        birthDate: row?.birth_date ?? null,
        spouseName: row?.spouse_name ?? null,
        marriageDate: row?.marriage_date ?? null,
        children: row?.children ?? [],
      };

      const registration = await client.query<{ id: string }>(`
        SELECT id FROM event_registrations
        WHERE event_id = $1 AND user_id = $2 AND status = 'confirmed'
      `, [event.id, principal.userId]);
      if (!registration.rows[0]) {
        return { profile, selectedParticipantKeys: ['registrant'], selectedOfferingIds: [], alreadyRegistered: false };
      }

      const registrationId = registration.rows[0].id;
      const participants = await client.query<{ source_type: string; name: string; birth_date: string | null }>(`
        SELECT source_type, name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date
        FROM event_registration_participants
        WHERE registration_id = $1
        ORDER BY position, id
      `, [registrationId]);
      const participantKeys = participants.rows.flatMap((participant) => {
        if (participant.source_type === 'registrant') return ['registrant'];
        if (participant.source_type === 'spouse') return ['spouse'];
        const index = profile.children.findIndex((child) => (
          child.name === participant.name && child.birthDate === participant.birth_date
        ));
        return index >= 0 ? [`child:${index}`] : [];
      });
      const offerings = await client.query<{ offering_id: string }>(`
        SELECT offering_id FROM registration_offering_selections
        WHERE registration_id = $1
        ORDER BY offering_id
      `, [registrationId]);
      return {
        profile,
        selectedParticipantKeys: [...new Set(participantKeys)],
        selectedOfferingIds: offerings.rows.map((offering) => offering.offering_id),
        alreadyRegistered: true,
      };
    });
  }

  private async saveProfile(client: PoolClient, tenantId: string, userId: string, draft: MemberProfileDraft) {
    const profile = await client.query<{ id: string }>(`
      INSERT INTO member_profiles (
        tenant_id, user_id, phone, birth_date, spouse_name, marriage_date, updated_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $2)
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET
        phone = EXCLUDED.phone,
        birth_date = EXCLUDED.birth_date,
        spouse_name = EXCLUDED.spouse_name,
        marriage_date = EXCLUDED.marriage_date,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
      RETURNING id
    `, [
      tenantId, userId, draft.props.phone ?? null, draft.props.birthDate ?? null,
      draft.props.spouseName ?? null, draft.props.marriageDate ?? null,
    ]);
    const profileId = profile.rows[0]!.id;
    await client.query('DELETE FROM member_children WHERE profile_id = $1', [profileId]);
    for (const child of draft.props.children) {
      await client.query(`
        INSERT INTO member_children (tenant_id, profile_id, member_user_id, name, birth_date)
        VALUES ($1, $2, $3, $4, $5)
      `, [tenantId, profileId, userId, child.name, child.birthDate ?? null]);
    }
  }

  private async persistRegistration(
    client: PoolClient,
    eventView: PublicEventView,
    userId: string,
    answers: RegistrationAnswerInput[],
    participants: RegistrationParticipantSnapshot[],
    offeringIds: string[],
  ): Promise<string> {
    const event = await client.query<{
      capacity: number | null;
      registration_deadline: Date | null;
      current_form_version: number;
    }>(`
      SELECT capacity, registration_deadline, current_form_version FROM events
      WHERE id = $1 AND status = 'published'
      FOR UPDATE
    `, [eventView.id]);
    if (!event.rows[0]) throw new ConflictError('O evento não está aberto para inscrições.');
    if (event.rows[0].registration_deadline && event.rows[0].registration_deadline < new Date()) {
      throw new ConflictError('O prazo de inscrição terminou.');
    }

    const current = await client.query<{ id: string; checked_in: boolean; participant_count: string }>(`
      SELECT registrations.id,
        EXISTS (
          SELECT 1 FROM event_registration_participants AS participants
          WHERE participants.registration_id = registrations.id AND participants.checked_in_at IS NOT NULL
        ) AS checked_in,
        (SELECT count(*)::text FROM event_registration_participants AS participants
          WHERE participants.registration_id = registrations.id) AS participant_count
      FROM event_registrations AS registrations
      WHERE registrations.event_id = $1 AND registrations.user_id = $2
      FOR UPDATE
    `, [eventView.id, userId]);
    if (current.rows[0]?.checked_in) {
      throw new ConflictError('A presença desta inscrição já foi registrada e não pode mais ser alterada.');
    }

    if (event.rows[0].capacity) {
      const count = await client.query<{ total: string }>(`
        SELECT count(*)::text AS total
        FROM event_registration_participants AS participants
        JOIN event_registrations AS registrations
          ON registrations.id = participants.registration_id
         AND registrations.event_id = participants.event_id
         AND registrations.tenant_id = participants.tenant_id
        WHERE participants.event_id = $1 AND registrations.status = 'confirmed'
      `, [eventView.id]);
      const previousCount = Number(current.rows[0]?.participant_count ?? 0);
      if (Number(count.rows[0]?.total ?? 0) - previousCount + participants.length > event.rows[0].capacity) {
        throw new ConflictError('Não há vagas suficientes para todas as pessoas selecionadas.');
      }
    }

    if (offeringIds.length) {
      const available = await client.query<{ id: string }>(`
        SELECT id FROM event_offerings
        WHERE event_id = $1 AND active AND id = ANY($2::uuid[])
      `, [eventView.id, offeringIds]);
      if (available.rowCount !== offeringIds.length) {
        throw new ConflictError('Um dos adicionais selecionados não está mais disponível.');
      }
    }

    const registration = await client.query<{ id: string }>(`
      INSERT INTO event_registrations (tenant_id, event_id, user_id, status, form_version)
      VALUES ($1, $2, $3, 'confirmed', $4)
      ON CONFLICT (event_id, user_id)
      DO UPDATE SET status = 'confirmed', form_version = EXCLUDED.form_version, updated_at = now()
      RETURNING id
    `, [eventView.tenantId, eventView.id, userId, event.rows[0].current_form_version]);
    const registrationId = registration.rows[0]!.id;

    await client.query('DELETE FROM registration_answers WHERE registration_id = $1', [registrationId]);
    for (const answer of answers) {
      await client.query(`
        INSERT INTO registration_answers (tenant_id, event_id, registration_id, field_id, value)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `, [eventView.tenantId, eventView.id, registrationId, answer.fieldId, JSON.stringify(answer.value)]);
    }

    await client.query('DELETE FROM event_registration_participants WHERE registration_id = $1', [registrationId]);
    for (const [position, participant] of participants.entries()) {
      await client.query(`
        INSERT INTO event_registration_participants (
          tenant_id, event_id, registration_id, source_type, name, birth_date, position
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        eventView.tenantId, eventView.id, registrationId, participant.sourceType,
        participant.name, participant.birthDate ?? null, position,
      ]);
    }

    await client.query('DELETE FROM registration_offering_selections WHERE registration_id = $1', [registrationId]);
    for (const offeringId of offeringIds) {
      await client.query(`
        INSERT INTO registration_offering_selections (tenant_id, event_id, registration_id, offering_id)
        VALUES ($1, $2, $3, $4)
      `, [eventView.tenantId, eventView.id, registrationId, offeringId]);
    }
    return registrationId;
  }

  private async loadIdentity(client: PoolClient, tenantId: string, userId: string): Promise<LoginIdentity> {
    const result = await client.query<{
      name: string; email: string; password_hash: string | null; roles: string[]; permissions: Permission[];
    }>(`
      SELECT users.name, users.email, users.password_hash,
        COALESCE(array_agg(DISTINCT roles.key) FILTER (WHERE roles.key IS NOT NULL), ARRAY[]::text[]) AS roles,
        COALESCE(array_agg(DISTINCT role_permissions.permission_key) FILTER (WHERE role_permissions.permission_key IS NOT NULL), ARRAY[]::text[]) AS permissions
      FROM users
      LEFT JOIN user_roles ON user_roles.user_id = users.id AND user_roles.tenant_id = users.tenant_id
      LEFT JOIN roles ON roles.id = user_roles.role_id AND roles.tenant_id = user_roles.tenant_id
      LEFT JOIN role_permissions ON role_permissions.role_id = roles.id AND role_permissions.tenant_id = roles.tenant_id
      WHERE users.id = $1
      GROUP BY users.id
    `, [userId]);
    const row = result.rows[0]!;
    return { userId, tenantId, name: row.name, email: row.email, passwordHash: row.password_hash, roles: row.roles, permissions: row.permissions };
  }
}
