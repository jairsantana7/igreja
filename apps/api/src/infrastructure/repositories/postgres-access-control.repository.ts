import type { AccessControlRepository, RoleView } from '../../application/ports/access-control.port';
import type { AuthenticatedPrincipal, Permission } from '../../domain/entities/permission';
import { ConflictError } from '../../application/use-cases/errors';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresAccessControlRepository implements AccessControlRepository {
  constructor(private readonly database: PostgresDatabase) {}

  list(principal: AuthenticatedPrincipal) {
    return this.database.withTenant(principal.tenantId, async (client) => {
      const permissions = await client.query<{ key: string; description: string }>('SELECT key, description FROM permissions ORDER BY key');
      const roles = await client.query<{ id: string; key: string; name: string; is_system: boolean; permissions: Permission[] }>(`
        SELECT roles.id, roles.key, roles.name, roles.is_system,
          COALESCE(array_agg(role_permissions.permission_key ORDER BY role_permissions.permission_key)
            FILTER (WHERE role_permissions.permission_key IS NOT NULL), ARRAY[]::text[]) AS permissions
        FROM roles
        LEFT JOIN role_permissions ON role_permissions.role_id = roles.id AND role_permissions.tenant_id = roles.tenant_id
        GROUP BY roles.id
        ORDER BY roles.is_system DESC, roles.name
      `);
      return { permissions: permissions.rows, roles: roles.rows.map(this.mapRole) };
    });
  }

  createRole(principal: AuthenticatedPrincipal, input: { key: string; name: string; permissions: string[] }) {
    return this.database.withTenant(principal.tenantId, async (client) => {
      const valid = await client.query<{ key: Permission }>('SELECT key FROM permissions WHERE key = ANY($1::text[])', [input.permissions]);
      if (valid.rowCount !== new Set(input.permissions).size) throw new ConflictError('Uma ou mais permissões não existem.');
      const role = await client.query<{ id: string; key: string; name: string; is_system: boolean }>(`
        INSERT INTO roles (tenant_id, key, name) VALUES ($1, $2, $3)
        RETURNING id, key, name, is_system
      `, [principal.tenantId, input.key, input.name.trim()]);
      for (const permission of valid.rows) {
        await client.query('INSERT INTO role_permissions (tenant_id, role_id, permission_key) VALUES ($1, $2, $3)', [
          principal.tenantId, role.rows[0]!.id, permission.key,
        ]);
      }
      return this.mapRole({ ...role.rows[0]!, permissions: valid.rows.map((item) => item.key) });
    });
  }

  createUser(principal: AuthenticatedPrincipal, input: { name: string; email: string; passwordHash: string; roleIds: string[] }) {
    return this.database.withTenant(principal.tenantId, async (client) => {
      const roles = await client.query<{ id: string }>('SELECT id FROM roles WHERE id = ANY($1::uuid[])', [input.roleIds]);
      if (roles.rowCount !== new Set(input.roleIds).size) throw new ConflictError('Um ou mais papéis não pertencem à comunidade.');
      try {
        const user = await client.query<{ id: string; name: string; email: string }>(`
          INSERT INTO users (tenant_id, name, email, password_hash) VALUES ($1, $2, $3, $4)
          RETURNING id, name, email
        `, [principal.tenantId, input.name, input.email, input.passwordHash]);
        for (const role of roles.rows) {
          await client.query('INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)', [
            principal.tenantId, user.rows[0]!.id, role.id,
          ]);
        }
        return user.rows[0]!;
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Já existe um usuário com este e-mail.');
        throw error;
      }
    });
  }

  private mapRole(row: { id: string; key: string; name: string; is_system: boolean; permissions: Permission[] }): RoleView {
    return { id: row.id, key: row.key, name: row.name, isSystem: row.is_system, permissions: row.permissions };
  }
}
