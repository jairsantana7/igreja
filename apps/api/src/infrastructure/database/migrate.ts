import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

const MIGRATION_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_KEY = 746724019;
const LEGACY_BASELINE = '027_member_phone_login.sql';

export interface MigrationFile {
  name: string;
  path: string;
  checksum: string;
}

export function discoverMigrations(directory: string): MigrationFile[] {
  const migrations = readdirSync(directory)
    .filter((name) => MIGRATION_PATTERN.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = resolve(directory, name);
      const contents = readFileSync(path);
      return { name, path, checksum: createHash('sha256').update(contents).digest('hex') };
    });

  const prefixes = migrations.map(({ name }) => name.slice(0, 3));
  const duplicate = prefixes.find((prefix, index) => prefixes.indexOf(prefix) !== index);
  if (duplicate) throw new Error(`Há mais de uma migration com o prefixo ${duplicate}.`);

  return migrations;
}

function resolveMigrationsDirectory(): string {
  const candidates = [
    process.env.DATABASE_MIGRATIONS_PATH,
    resolve(process.cwd(), 'database/migrations'),
    resolve(process.cwd(), '../../database/migrations'),
    resolve(__dirname, '../../../../../database/migrations'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const directory = candidates.find(existsSync);
  if (!directory) throw new Error('Diretório database/migrations não encontrado. Defina DATABASE_MIGRATIONS_PATH.');
  return directory;
}

async function prepareLedger(client: PoolClient): Promise<boolean> {
  const existing = await client.query<{ has_schema: boolean }>(
    `SELECT to_regclass('public.events') IS NOT NULL AS has_schema`,
  );

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE igreja_owner');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name text PRIMARY KEY CHECK (name ~ '^[0-9]{3}_[a-z0-9_]+[.]sql$'),
        checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('REVOKE ALL ON public.schema_migrations FROM PUBLIC, igreja_runtime');
    await client.query('GRANT SELECT ON public.schema_migrations TO igreja_migrator');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  return existing.rows[0]?.has_schema ?? false;
}

const legacyLandmarks = [
  "to_regclass('public.events') IS NOT NULL",
  "to_regclass('public.community_integrations') IS NOT NULL",
  "to_regclass('public.audit_events') IS NOT NULL",
  "to_regclass('public.event_media') IS NOT NULL",
  "to_regclass('public.event_form_versions') IS NOT NULL",
  "to_regclass('public.event_collaborators') IS NOT NULL",
  "to_regclass('public.conversation_channels') IS NOT NULL",
  "to_regclass('public.member_profiles') IS NOT NULL",
  "to_regclass('public.member_children') IS NOT NULL",
  "to_regclass('public.whatsapp_message_templates') IS NOT NULL",
  "to_regclass('public.communication_templates') IS NOT NULL",
  "to_regclass('public.event_reminder_rules') IS NOT NULL",
  "to_regclass('public.pastoral_followups') IS NOT NULL",
  "to_regclass('public.event_offerings') IS NOT NULL",
  "to_regclass('public.conversation_provider_states') IS NOT NULL",
  "to_regclass('public.conversation_message_attachments') IS NOT NULL",
  "to_regclass('public.conversation_message_reactions') IS NOT NULL",
  "to_regclass('public.member_onboarding_deliveries') IS NOT NULL",
  "to_regclass('public.event_galleries') IS NOT NULL",
  "to_regclass('public.gallery_photos') IS NOT NULL",
  "to_regclass('public.audit_events_tenant_action_created_idx') IS NOT NULL",
  "to_regprocedure('app.list_restorable_conversation_channels()') IS NOT NULL",
  "to_regprocedure('app.resolve_public_event_linked_gallery(uuid)') IS NOT NULL",
  "to_regprocedure('app.normalize_br_phone(text)') IS NOT NULL",
  "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auth_sessions' AND column_name = 'proof_hash')",
  "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'member_profiles' AND column_name = 'birth_date')",
  "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'member_profiles' AND column_name = 'whatsapp_communication_opt_in')",
  "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'hero_shade_color')",
  "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'pix_integration_id')",
  "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'member_profiles' AND column_name = 'phone_normalized')",
  "EXISTS (SELECT 1 FROM public.permissions WHERE key = 'followups.delete')",
] as const;

async function adoptLegacySchema(client: PoolClient, migrations: MigrationFile[]): Promise<void> {
  if (process.env.MIGRATION_BASELINE_CONFIRM !== 'ADOTAR_SCHEMA_EXISTENTE') {
    throw new Error(
      'A adoção exige MIGRATION_BASELINE_CONFIRM=ADOTAR_SCHEMA_EXISTENTE. Faça backup e leia docs/database-migrations.md.',
    );
  }

  const baselineIndex = migrations.findIndex(({ name }) => name === LEGACY_BASELINE);
  if (baselineIndex < 0) throw new Error(`A migration de baseline ${LEGACY_BASELINE} não foi encontrada.`);

  const verification = await client.query<{ valid: boolean }>(
    `SELECT (${legacyLandmarks.join(') AND (')}) AS valid`,
  );
  if (!verification.rows[0]?.valid) {
    throw new Error('O schema existente não corresponde ao baseline legado esperado; nenhuma migration foi adotada.');
  }

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE igreja_owner');
    for (const migration of migrations.slice(0, baselineIndex + 1)) {
      await client.query(
        'INSERT INTO public.schema_migrations (name, checksum_sha256) VALUES ($1, $2)',
        [migration.name, migration.checksum],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  console.log(`Baseline legado adotado até ${LEGACY_BASELINE}.`);
}

async function applyPending(client: PoolClient, migrations: MigrationFile[]): Promise<void> {
  const applied = await client.query<{ name: string; checksum_sha256: string }>(
    'SELECT name, checksum_sha256 FROM public.schema_migrations ORDER BY name',
  );
  const checksums = new Map(applied.rows.map((row) => [row.name, row.checksum_sha256]));
  const availableNames = new Set(migrations.map(({ name }) => name));
  const unknown = applied.rows.find(({ name }) => !availableNames.has(name));
  if (unknown) {
    throw new Error(
      `O banco registra ${unknown.name}, ausente nesta versão do código. Use uma release compatível; não faça downgrade cego.`,
    );
  }

  for (const migration of migrations) {
    const knownChecksum = checksums.get(migration.name);
    if (knownChecksum && knownChecksum !== migration.checksum) {
      throw new Error(`A migration aplicada ${migration.name} foi alterada. Restaure o arquivo original e crie outra migration.`);
    }
    if (knownChecksum) continue;

    console.log(`Aplicando ${migration.name}...`);
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(migration.path, 'utf8'));
      await client.query(
        'INSERT INTO public.schema_migrations (name, checksum_sha256) VALUES ($1, $2)',
        [migration.name, migration.checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

export async function migrate(options: { adoptExisting?: boolean } = {}): Promise<void> {
  loadDotEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
  loadDotEnv({ path: resolve(process.cwd(), '.env'), quiet: true });
  const connectionString = process.env.DATABASE_MIGRATION_URL;
  if (!connectionString) throw new Error('DATABASE_MIGRATION_URL é obrigatória para executar migrations.');

  const migrations = discoverMigrations(resolveMigrationsDirectory());
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    const hasExistingSchema = await prepareLedger(client);
    const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM public.schema_migrations');
    if (hasExistingSchema && count.rows[0]?.count === '0') {
      if (!options.adoptExisting) {
        throw new Error(
          'Schema anterior ao controle de migrations detectado. Faça backup e execute pnpm db:migrate:adopt uma única vez.',
        );
      }
      await adoptLegacySchema(client, migrations);
    }
    await applyPending(client, migrations);
    console.log('Banco de dados atualizado.');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrate({ adoptExisting: process.argv.includes('--adopt-existing') }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Falha nas migrations: ${message}`);
    process.exitCode = 1;
  });
}
