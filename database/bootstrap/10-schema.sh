#!/bin/sh
set -eu

: "${APP_MIGRATOR_PASSWORD:?APP_MIGRATOR_PASSWORD is required}"
export PGPASSWORD="$APP_MIGRATOR_PASSWORD"
MIGRATION_USER=igreja_migrator

psql --username "$MIGRATION_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --single-transaction <<'SQL'
SET LOCAL ROLE igreja_owner;
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  name text PRIMARY KEY CHECK (name ~ '^[0-9]{3}_[a-z0-9_]+[.]sql$'),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.schema_migrations FROM PUBLIC, igreja_runtime;
GRANT SELECT ON public.schema_migrations TO igreja_migrator;
SQL

for migration in /migrations/*.sql; do
  name="$(basename "$migration")"
  checksum="$(sha256sum "$migration" | awk '{print $1}')"
  applied_checksum="$(
    psql --username "$MIGRATION_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align \
      --set=name="$name" <<'SQL'
SELECT checksum_sha256 FROM public.schema_migrations WHERE name = :'name';
SQL
  )"
  applied_checksum="$(printf '%s' "$applied_checksum" | tr -d '[:space:]')"

  if [ -n "$applied_checksum" ]; then
    if [ "$applied_checksum" != "$checksum" ]; then
      echo "Migration aplicada ${name} foi alterada." >&2
      exit 1
    fi
    continue
  fi

  echo "Applying ${name}"
  psql --username "$MIGRATION_USER" --dbname "$POSTGRES_DB" \
    --set=ON_ERROR_STOP=1 --single-transaction --file "$migration"
  psql --username "$MIGRATION_USER" --dbname "$POSTGRES_DB" \
    --set=ON_ERROR_STOP=1 --single-transaction --set=name="$name" --set=checksum="$checksum" <<'SQL'
SET LOCAL ROLE igreja_owner;
INSERT INTO public.schema_migrations (name, checksum_sha256) VALUES (:'name', :'checksum');
SQL
done
