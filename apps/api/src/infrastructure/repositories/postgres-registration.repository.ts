import type { PoolClient } from 'pg';
import type { EventRegistrationRepository, RegistrationAnswerInput } from '../../application/ports/event.port';
import type { LoginIdentity } from '../../application/ports/authentication.port';
import type { Permission } from '../../domain/entities/permission';
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
      const memberRole = await client.query<{ id: string }>("SELECT id FROM roles WHERE key = 'member' LIMIT 1");
      if (!memberRole.rows[0]) throw new Error('O papel padrão de membro não está configurado.');
      await client.query('INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)', [
        input.event.tenantId,
        userId,
        memberRole.rows[0].id,
      ]);
      const registrationId = await this.persistRegistration(client, input.event.tenantId, input.event.id, userId, input.answers);
      return {
        identity: await this.loadIdentity(client, input.event.tenantId, userId),
        registrationId,
      };
    });
  }

  register(input: Parameters<EventRegistrationRepository['register']>[0]) {
    return this.database.withTenant(input.principal.tenantId, (client) =>
      this.persistRegistration(client, input.principal.tenantId, input.event.id, input.principal.userId, input.answers),
    );
  }

  private async persistRegistration(
    client: PoolClient,
    tenantId: string,
    eventId: string,
    userId: string,
    answers: RegistrationAnswerInput[],
  ): Promise<string> {
    const event = await client.query<{ capacity: number | null; registration_deadline: Date | null }>(`
      SELECT capacity, registration_deadline FROM events
      WHERE id = $1 AND status = 'published'
      FOR UPDATE
    `, [eventId]);
    if (!event.rows[0]) throw new ConflictError('O evento não está aberto para inscrições.');
    if (event.rows[0].registration_deadline && event.rows[0].registration_deadline < new Date()) {
      throw new ConflictError('O prazo de inscrição terminou.');
    }

    const current = await client.query<{ id: string }>(
      'SELECT id FROM event_registrations WHERE event_id = $1 AND user_id = $2',
      [eventId, userId],
    );
    if (!current.rows[0] && event.rows[0].capacity) {
      const count = await client.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM event_registrations WHERE event_id = $1 AND status = 'confirmed'",
        [eventId],
      );
      if (Number(count.rows[0]?.total ?? 0) >= event.rows[0].capacity) throw new ConflictError('As vagas deste evento terminaram.');
    }

    const registration = await client.query<{ id: string }>(`
      INSERT INTO event_registrations (tenant_id, event_id, user_id, status)
      VALUES ($1, $2, $3, 'confirmed')
      ON CONFLICT (event_id, user_id)
      DO UPDATE SET status = 'confirmed', updated_at = now()
      RETURNING id
    `, [tenantId, eventId, userId]);
    const registrationId = registration.rows[0]!.id;

    for (const answer of answers) {
      await client.query(`
        INSERT INTO registration_answers (tenant_id, event_id, registration_id, field_id, value)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (registration_id, field_id)
        DO UPDATE SET value = EXCLUDED.value
      `, [tenantId, eventId, registrationId, answer.fieldId, JSON.stringify(answer.value)]);
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
