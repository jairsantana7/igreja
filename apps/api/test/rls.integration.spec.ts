import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { env } from '../src/infrastructure/config/env';

const describeDatabase = env.databaseAdminUrl ? describe : describe.skip;
const tenantA = 'a0000000-0000-4000-8000-000000000001';
const tenantB = 'b0000000-0000-4000-8000-000000000002';
const userA = 'a1000000-0000-4000-8000-000000000001';
const userB = 'b1000000-0000-4000-8000-000000000002';
const eventA = 'a2000000-0000-4000-8000-000000000001';
const eventB = 'b2000000-0000-4000-8000-000000000002';

describeDatabase('PostgreSQL RLS', () => {
  const admin = new Pool({ connectionString: env.databaseAdminUrl });
  const runtime = new Pool({ connectionString: env.databaseUrl, max: 1 });

  beforeAll(async () => {
    await admin.query(`
      INSERT INTO tenant_directory (tenant_id, slug) VALUES
        ('${tenantA}', 'rls-tenant-a'), ('${tenantB}', 'rls-tenant-b')
      ON CONFLICT DO NOTHING;
      INSERT INTO tenants (id, name) VALUES
        ('${tenantA}', 'Tenant A'), ('${tenantB}', 'Tenant B')
      ON CONFLICT DO NOTHING;
      INSERT INTO users (id, tenant_id, name, email) VALUES
        ('${userA}', '${tenantA}', 'User A', 'user@a.test'),
        ('${userB}', '${tenantB}', 'User B', 'user@b.test')
      ON CONFLICT DO NOTHING;
      INSERT INTO events (id, tenant_id, created_by_user_id, slug, title, starts_at) VALUES
        ('${eventA}', '${tenantA}', '${userA}', 'evento-a', 'Evento A', now() + interval '1 day'),
        ('${eventB}', '${tenantB}', '${userB}', 'evento-b', 'Evento B', now() + interval '1 day')
      ON CONFLICT DO NOTHING;
      INSERT INTO community_integrations (tenant_id, category, provider_key, enabled) VALUES
        ('${tenantA}', 'identity', 'google', false),
        ('${tenantB}', 'identity', 'google', false)
      ON CONFLICT DO NOTHING;
    `);
  });

  afterAll(async () => {
    await admin.query(`
      DELETE FROM community_integrations WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM events WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM users WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM audit_events WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM tenants WHERE id IN ('${tenantA}', '${tenantB}');
      DELETE FROM tenant_directory WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    `);
    await Promise.all([admin.end(), runtime.end()]);
  });

  async function inTenant<T>(client: PoolClient, tenantId: string, work: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await work();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  it('runtime não é superuser, bypass nem dono das tabelas', async () => {
    const role = await runtime.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const ownership = await runtime.query<{ total: string }>(`
      SELECT count(*)::text AS total FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND pg_get_userbyid(c.relowner) = current_user
    `);
    expect(Number(ownership.rows[0]!.total)).toBe(0);
  });

  it('sem contexto não retorna linhas de tenant', async () => {
    const result = await runtime.query('SELECT id FROM users');
    expect(result.rows).toEqual([]);
    await expect(runtime.query(
      "INSERT INTO users (tenant_id, name, email) VALUES ($1, 'Sem contexto', 'sem-contexto@test.local')",
      [tenantA],
    )).rejects.toThrow();
  });

  it('foreign key composta impede vínculo de filho com evento de outro tenant', async () => {
    const client = await runtime.connect();
    try {
      await inTenant(client, tenantA, async () => {
        await expect(client.query(`
          INSERT INTO event_form_fields (tenant_id, event_id, field_key, label, type, position)
          VALUES ($1, $2, 'campo_teste', 'Campo teste', 'short_text', 0)
        `, [tenantA, eventB])).rejects.toThrow();
      });
    } finally { client.release(); }
  });

  it('tenant A não lê, insere ou move dados para tenant B', async () => {
    const client = await runtime.connect();
    try {
      await inTenant(client, tenantA, async () => {
        const own = await client.query('SELECT id FROM users ORDER BY id');
        expect(own.rows.map((row) => row.id)).toEqual([userA]);
        const integrations = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM community_integrations');
        expect(integrations.rows.map((row) => row.tenant_id)).toEqual([tenantA]);
        const other = await client.query('SELECT id FROM users WHERE id = $1', [userB]);
        expect(other.rows).toEqual([]);
        await expect(client.query(
          "INSERT INTO users (tenant_id, name, email) VALUES ($1, 'Intruso', 'intruso@b.test')",
          [tenantB],
        )).rejects.toThrow();
        await expect(client.query(`
          INSERT INTO community_integrations (tenant_id, category, provider_key)
          VALUES ($1, 'payment', 'cross_tenant')
        `, [tenantB])).rejects.toThrow();
      });
      await inTenant(client, tenantA, async () => {
        await expect(client.query('UPDATE users SET tenant_id = $1 WHERE id = $2', [tenantB, userA])).rejects.toThrow();
      });
    } finally { client.release(); }
  });

  it('contexto local não vaza ao reutilizar a conexão A/B/A', async () => {
    const client = await runtime.connect();
    try {
      for (const [tenantId, expected] of [[tenantA, userA], [tenantB, userB], [tenantA, userA]] as const) {
        await inTenant(client, tenantId, async () => {
          const result = await client.query<{ id: string }>('SELECT id FROM users');
          expect(result.rows.map((row) => row.id)).toEqual([expected]);
        });
        expect((await client.query('SELECT id FROM users')).rows).toEqual([]);
      }
    } finally { client.release(); }
  });

  it('auditoria é isolada por tenant e imutável para o runtime', async () => {
    const client = await runtime.connect();
    try {
      await inTenant(client, tenantA, async () => {
        const result = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM audit_events');
        expect(result.rows.length).toBeGreaterThan(0);
        expect(result.rows.every((row) => row.tenant_id === tenantA)).toBe(true);
        await expect(client.query("UPDATE audit_events SET actor_name = 'alterado' WHERE tenant_id = $1", [tenantA])).rejects.toThrow();
      });
      await inTenant(client, tenantA, async () => {
        await expect(client.query('DELETE FROM audit_events WHERE tenant_id = $1', [tenantA])).rejects.toThrow();
      });
    } finally { client.release(); }
  });

  it('todas as tabelas tenant possuem RLS forçada e política', async () => {
    const expected = ['audit_events', 'community_integrations', 'event_form_fields', 'event_registrations', 'events', 'external_accounts', 'registration_answers', 'role_permissions', 'roles', 'tenants', 'user_roles', 'users'];
    const result = await admin.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policies: string }>(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.policyname)::text AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
      GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
      ORDER BY c.relname
    `, [expected]);
    expect(result.rows.map((row) => row.relname)).toEqual(expected);
    expect(result.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity && Number(row.policies) > 0)).toBe(true);
  });
});
