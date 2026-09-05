import { hash } from 'bcryptjs';
import { Pool } from 'pg';
import { env } from '../config/env';

const ids = {
  tenant: '00000000-0000-4000-8000-000000000001',
  admin: '10000000-0000-4000-8000-000000000001',
  adminRole: '20000000-0000-4000-8000-000000000001',
  pastorRole: '20000000-0000-4000-8000-000000000002',
  memberRole: '20000000-0000-4000-8000-000000000003',
  event: '30000000-0000-4000-8000-000000000001',
  eventPublic: '40000000-0000-4000-8000-000000000001',
  field: '50000000-0000-4000-8000-000000000001',
};

async function seed(): Promise<void> {
  if (!env.migrationUrl) throw new Error('DATABASE_MIGRATION_URL é obrigatória para o seed.');
  const pool = new Pool({ connectionString: env.migrationUrl, application_name: 'igreja-seed' });
  const client = await pool.connect();
  try {
    const passwordHash = await hash('Comunidade#2026', 12);
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE igreja_owner');
    await client.query(`
      INSERT INTO tenant_directory (tenant_id, slug) VALUES ($1, 'comunidade-demo')
      ON CONFLICT (tenant_id) DO UPDATE SET slug = EXCLUDED.slug
    `, [ids.tenant]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [ids.tenant]);
    await client.query(`
      INSERT INTO tenants (id, name) VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    `, [ids.tenant, env.appName]);
    await client.query(`
      INSERT INTO users (id, tenant_id, name, email, password_hash)
      VALUES ($1, $2, 'Admin Inicial', 'admin@comunidade.local', $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, updated_at = now()
    `, [ids.admin, ids.tenant, passwordHash]);
    await client.query(`
      INSERT INTO roles (id, tenant_id, key, name, is_system) VALUES
        ($1, $4, 'admin', 'Administrador', true),
        ($2, $4, 'pastor', 'Pastor', true),
        ($3, $4, 'member', 'Membro', true)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `, [ids.adminRole, ids.pastorRole, ids.memberRole, ids.tenant]);
    await client.query(`
      INSERT INTO role_permissions (tenant_id, role_id, permission_key)
      SELECT $1, $2, key FROM permissions
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.adminRole]);
    await client.query(`
      INSERT INTO role_permissions (tenant_id, role_id, permission_key)
      SELECT $1, $2, key FROM permissions
      WHERE (
          key LIKE 'events.%'
          AND key NOT IN ('events.read_all', 'events.manage_all')
        )
        OR key LIKE 'settings.%'
        OR key IN (
          'conversations.read', 'conversations.reply', 'conversations.assign',
          'channels.manage_own', 'members.profile_read', 'members.profile_manage'
        )
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.pastorRole]);
    await client.query(`
      INSERT INTO role_permissions (tenant_id, role_id, permission_key)
      VALUES ($1, $2, 'events.register'), ($1, $2, 'sessions.manage')
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.memberRole]);
    await client.query(`
      INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [ids.tenant, ids.admin, ids.adminRole]);
    await client.query(`
      INSERT INTO events (
        id, tenant_id, created_by_user_id, public_id, slug, title, description,
        location, starts_at, registration_deadline, capacity, status
      ) VALUES (
        $1, $2, $3, $4, 'encontro-de-boas-vindas', 'Encontro de boas-vindas',
        'Um tempo para conhecer pessoas, compartilhar histórias e caminhar em comunidade.',
        'Salão principal', now() + interval '14 days', now() + interval '12 days', 120, 'published'
      )
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = now()
    `, [ids.event, ids.tenant, ids.admin, ids.eventPublic]);
    await client.query(`
      INSERT INTO event_public_directory (public_id, tenant_id, event_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (public_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, event_id = EXCLUDED.event_id
    `, [ids.eventPublic, ids.tenant, ids.event]);
    await client.query(`
      INSERT INTO event_form_fields (id, tenant_id, event_id, field_key, label, type, required, options, position)
      VALUES ($1, $2, $3, 'restricao_alimentar', 'Possui alguma restrição alimentar?', 'short_text', false, '[]', 0)
      ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
    `, [ids.field, ids.tenant, ids.event]);
    await client.query(`
      INSERT INTO event_form_versions (tenant_id, event_id, version, schema_snapshot, created_by_user_id)
      VALUES ($1, $2, 1, $3::jsonb, $4)
      ON CONFLICT (event_id, tenant_id, version) DO NOTHING
    `, [ids.tenant, ids.event, JSON.stringify([{
      id: ids.field,
      key: 'restricao_alimentar',
      label: 'Possui alguma restrição alimentar?',
      type: 'short_text',
      required: false,
      options: [],
    }]), ids.admin]);
    await client.query('COMMIT');
    process.stdout.write('Seed local concluído.\n');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void seed();
