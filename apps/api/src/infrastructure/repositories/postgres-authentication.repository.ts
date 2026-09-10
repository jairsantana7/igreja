import type { AuthenticationRepository, LoginIdentity } from '../../application/ports/authentication.port';
import type { Permission } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

interface LoginRow {
  user_id: string;
  tenant_id: string;
  user_name: string;
  user_email: string;
  password_hash: string | null;
  role_keys: string[];
  permission_keys: Permission[];
}

export class PostgresAuthenticationRepository implements AuthenticationRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async findForLogin(tenantSlug: string, identifier: string): Promise<LoginIdentity | null> {
    const result = await this.database.queryPublic<LoginRow>(
      'SELECT * FROM app.resolve_login_identity($1, $2)',
      [tenantSlug, identifier],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findForTenantLogin(tenantId: string, identifier: string): Promise<LoginIdentity | null> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query<LoginRow>(`
        SELECT
          users.id AS user_id,
          users.tenant_id,
          users.name AS user_name,
          users.email AS user_email,
          CASE
            WHEN users.temporary_password_expires_at IS NOT NULL
              AND users.temporary_password_expires_at <= now() THEN NULL
            ELSE users.password_hash
          END AS password_hash,
          COALESCE(array_agg(DISTINCT roles.key) FILTER (WHERE roles.key IS NOT NULL), ARRAY[]::text[]) AS role_keys,
          COALESCE(array_agg(DISTINCT role_permissions.permission_key) FILTER (WHERE role_permissions.permission_key IS NOT NULL), ARRAY[]::text[]) AS permission_keys
        FROM users
        LEFT JOIN member_profiles AS profiles
          ON profiles.user_id = users.id AND profiles.tenant_id = users.tenant_id
        LEFT JOIN user_roles ON user_roles.user_id = users.id AND user_roles.tenant_id = users.tenant_id
        LEFT JOIN roles ON roles.id = user_roles.role_id AND roles.tenant_id = user_roles.tenant_id
        LEFT JOIN role_permissions ON role_permissions.role_id = roles.id AND role_permissions.tenant_id = roles.tenant_id
        WHERE (
          users.email = lower($1)
          OR (profiles.phone_normalized = $1 AND profiles.phone_verified_at IS NOT NULL)
        )
        GROUP BY users.id, users.password_hash, users.temporary_password_expires_at
        LIMIT 1
      `, [identifier]);
      return result.rows[0] ? this.map(result.rows[0]) : null;
    });
  }

  private map(row: LoginRow): LoginIdentity {
    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      name: row.user_name,
      email: row.user_email,
      passwordHash: row.password_hash,
      roles: row.role_keys,
      permissions: row.permission_keys,
    };
  }
}
