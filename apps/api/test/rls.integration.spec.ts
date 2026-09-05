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
const mediaA = 'a3000000-0000-4000-8000-000000000001';
const mediaB = 'b3000000-0000-4000-8000-000000000002';
const publicEventA = 'a5000000-0000-4000-8000-000000000001';
const registrationA = 'a6000000-0000-4000-8000-000000000001';
const registrationB = 'b6000000-0000-4000-8000-000000000002';
const channelA = 'a7000000-0000-4000-8000-000000000001';
const channelB = 'b7000000-0000-4000-8000-000000000002';
const conversationA = 'a8000000-0000-4000-8000-000000000001';
const conversationB = 'b8000000-0000-4000-8000-000000000002';
const profileA = 'a9000000-0000-4000-8000-000000000001';
const profileB = 'b9000000-0000-4000-8000-000000000002';
const sessionA = 'aa000000-0000-4000-8000-000000000001';
const sessionB = 'bb000000-0000-4000-8000-000000000002';

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
      INSERT INTO auth_sessions (id, tenant_id, user_id, expires_at, proof_hash, user_agent_hash) VALUES
        ('${sessionA}', '${tenantA}', '${userA}', now() + interval '1 hour', repeat('a', 64), repeat('1', 64)),
        ('${sessionB}', '${tenantB}', '${userB}', now() + interval '1 hour', repeat('b', 64), repeat('2', 64))
      ON CONFLICT DO NOTHING;
      INSERT INTO member_profiles (id, tenant_id, user_id, city, state, updated_by_user_id) VALUES
        ('${profileA}', '${tenantA}', '${userA}', 'Cidade A', 'SP', '${userA}'),
        ('${profileB}', '${tenantB}', '${userB}', 'Cidade B', 'RJ', '${userB}')
      ON CONFLICT DO NOTHING;
      INSERT INTO member_children (tenant_id, profile_id, member_user_id, name) VALUES
        ('${tenantA}', '${profileA}', '${userA}', 'Filho A'),
        ('${tenantB}', '${profileB}', '${userB}', 'Filho B')
      ON CONFLICT DO NOTHING;
      INSERT INTO events (id, tenant_id, created_by_user_id, public_id, slug, title, starts_at) VALUES
        ('${eventA}', '${tenantA}', '${userA}', '${publicEventA}', 'evento-a', 'Evento A', now() + interval '1 day'),
        ('${eventB}', '${tenantB}', '${userB}', 'b5000000-0000-4000-8000-000000000002', 'evento-b', 'Evento B', now() + interval '1 day')
      ON CONFLICT (id) DO UPDATE SET status = 'draft';
      DELETE FROM event_public_directory WHERE event_id IN ('${eventA}', '${eventB}');
      INSERT INTO event_media (id, tenant_id, event_id, storage_key, mime_type, position) VALUES
        ('${mediaA}', '${tenantA}', '${eventA}', '${mediaA}.jpg', 'image/jpeg', 0),
        ('${mediaB}', '${tenantB}', '${eventB}', '${mediaB}.jpg', 'image/jpeg', 0)
      ON CONFLICT DO NOTHING;
      INSERT INTO community_integrations (tenant_id, category, provider_key, enabled) VALUES
        ('${tenantA}', 'identity', 'google', false),
        ('${tenantB}', 'identity', 'google', false)
      ON CONFLICT DO NOTHING;
      INSERT INTO event_form_versions (tenant_id, event_id, version, schema_snapshot, created_by_user_id) VALUES
        ('${tenantA}', '${eventA}', 1, '[]', '${userA}'),
        ('${tenantB}', '${eventB}', 1, '[]', '${userB}')
      ON CONFLICT DO NOTHING;
      INSERT INTO event_registrations (id, tenant_id, event_id, user_id, form_version) VALUES
        ('${registrationA}', '${tenantA}', '${eventA}', '${userA}', 1),
        ('${registrationB}', '${tenantB}', '${eventB}', '${userB}', 1)
      ON CONFLICT DO NOTHING;
      INSERT INTO conversation_channels (id, tenant_id, owner_user_id, provider_key, display_name, phone_number) VALUES
        ('${channelA}', '${tenantA}', '${userA}', 'whatsapp_cloud', 'Canal A', '+551100000001'),
        ('${channelB}', '${tenantB}', '${userB}', 'whatsapp_cloud', 'Canal B', '+551100000002')
      ON CONFLICT DO NOTHING;
      INSERT INTO conversations (id, tenant_id, channel_id, event_id, assigned_user_id, contact_name, contact_address) VALUES
        ('${conversationA}', '${tenantA}', '${channelA}', '${eventA}', '${userA}', 'Contato A', '+551199999001'),
        ('${conversationB}', '${tenantB}', '${channelB}', '${eventB}', '${userB}', 'Contato B', '+551199999002')
      ON CONFLICT DO NOTHING;
      INSERT INTO conversation_messages (tenant_id, conversation_id, direction, body, status) VALUES
        ('${tenantA}', '${conversationA}', 'inbound', 'Mensagem A', 'received'),
        ('${tenantB}', '${conversationB}', 'inbound', 'Mensagem B', 'received')
      ON CONFLICT DO NOTHING;
    `);
  });

  afterAll(async () => {
    await admin.query(`
      DELETE FROM community_integrations WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM conversation_messages WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM conversations WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM conversation_channels WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM member_children WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM member_profiles WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM auth_sessions WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM event_collaborators WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM event_check_ins WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM event_registrations WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM event_form_versions WHERE tenant_id IN ('${tenantA}', '${tenantB}');
      DELETE FROM event_media WHERE tenant_id IN ('${tenantA}', '${tenantB}');
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
      await inTenant(client, tenantA, async () => {
        await expect(client.query(`
          INSERT INTO event_check_ins (tenant_id, event_id, registration_id, checked_in_by_user_id)
          VALUES ($1, $2, $3, $4)
        `, [tenantA, eventA, registrationB, userA])).rejects.toThrow();
      });
      await inTenant(client, tenantA, async () => {
        await expect(client.query(`
          INSERT INTO event_media (tenant_id, event_id, storage_key, mime_type, position)
          VALUES ($1, $2, 'a4000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 1)
        `, [tenantA, eventB])).rejects.toThrow();
      });
      await inTenant(client, tenantA, async () => {
        await expect(client.query(`
          INSERT INTO event_collaborators (tenant_id, event_id, user_id, added_by_user_id)
          VALUES ($1, $2, $3, $4)
        `, [tenantA, eventA, userB, userA])).rejects.toThrow();
      });
      await inTenant(client, tenantA, async () => {
        await expect(client.query(`
          INSERT INTO conversations (tenant_id, channel_id, event_id, assigned_user_id, contact_name, contact_address)
          VALUES ($1, $2, $3, $4, 'Contato cruzado', '+551188888888')
        `, [tenantA, channelB, eventA, userA])).rejects.toThrow();
      });
      await inTenant(client, tenantA, async () => {
        await expect(client.query(`
          INSERT INTO member_children (tenant_id, profile_id, member_user_id, name)
          VALUES ($1, $2, $3, 'Vínculo cruzado')
        `, [tenantA, profileB, userA])).rejects.toThrow();
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

  it('canais, conversas e mensagens não atravessam comunidades', async () => {
    const client = await runtime.connect();
    try {
      await inTenant(client, tenantA, async () => {
        expect((await client.query('SELECT id FROM conversation_channels')).rows.map((row) => row.id)).toEqual([channelA]);
        expect((await client.query('SELECT id FROM conversations')).rows.map((row) => row.id)).toEqual([conversationA]);
        expect((await client.query('SELECT body FROM conversation_messages')).rows.map((row) => row.body)).toEqual(['Mensagem A']);
      });
      expect((await client.query('SELECT id FROM conversations')).rows).toEqual([]);
    } finally { client.release(); }
  });

  it('sessões e perfil complementar não atravessam comunidades', async () => {
    const client = await runtime.connect();
    try {
      await inTenant(client, tenantA, async () => {
        expect((await client.query('SELECT id FROM auth_sessions')).rows.map((row) => row.id)).toEqual([sessionA]);
        expect((await client.query('SELECT city FROM member_profiles')).rows).toEqual([{ city: 'Cidade A' }]);
        expect((await client.query('SELECT name FROM member_children')).rows).toEqual([{ name: 'Filho A' }]);
      });
      expect((await client.query('SELECT id FROM member_profiles')).rows).toEqual([]);
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

  it('mídia pública exige evento publicado e mantém o vínculo do tenant', async () => {
    const client = await runtime.connect();
    try {
      await inTenant(client, tenantA, async () => {
        await client.query('SELECT app.register_public_event($1, $2, $3)', [publicEventA, tenantA, eventA]);
      });
      expect((await client.query(
        'SELECT storage_key FROM app.resolve_public_event_media($1, $2)', [publicEventA, mediaA],
      )).rows).toEqual([]);
      await inTenant(client, tenantA, async () => {
        await client.query("UPDATE events SET status = 'published' WHERE id = $1", [eventA]);
      });
      expect((await client.query(
        'SELECT storage_key FROM app.resolve_public_event_media($1, $2)', [publicEventA, mediaA],
      )).rows).toEqual([{ storage_key: `${mediaA}.jpg` }]);
      expect((await client.query(
        'SELECT storage_key FROM app.resolve_public_event_media($1, $2)', [publicEventA, mediaB],
      )).rows).toEqual([]);
    } finally { client.release(); }
  });

  it('todas as tabelas tenant possuem RLS forçada e política', async () => {
    const expected = ['audit_events', 'auth_sessions', 'community_integrations', 'conversation_channels', 'conversation_messages', 'conversations', 'event_check_ins', 'event_collaborators', 'event_communications', 'event_form_fields', 'event_form_versions', 'event_media', 'event_registrations', 'event_templates', 'events', 'external_accounts', 'member_children', 'member_profiles', 'registration_answers', 'role_permissions', 'roles', 'tenants', 'user_roles', 'users'];
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
