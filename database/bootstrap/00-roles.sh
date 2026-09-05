#!/bin/sh
set -eu

: "${APP_RUNTIME_PASSWORD:?APP_RUNTIME_PASSWORD is required}"
: "${APP_MIGRATOR_PASSWORD:?APP_MIGRATOR_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=db_name="$POSTGRES_DB" \
  --set=runtime_password="$APP_RUNTIME_PASSWORD" \
  --set=migrator_password="$APP_MIGRATOR_PASSWORD" <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'igreja_owner') THEN
    CREATE ROLE igreja_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'igreja_migrator') THEN
    CREATE ROLE igreja_migrator LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'igreja_runtime') THEN
    CREATE ROLE igreja_runtime LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE igreja_migrator PASSWORD :'migrator_password';
ALTER ROLE igreja_runtime PASSWORD :'runtime_password';
GRANT igreja_owner TO igreja_migrator;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE, USAGE ON SCHEMA public TO igreja_owner;
GRANT USAGE ON SCHEMA public TO igreja_migrator, igreja_runtime;
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CREATE, TEMPORARY ON DATABASE :"db_name" TO igreja_owner;
GRANT CONNECT ON DATABASE :"db_name" TO igreja_migrator, igreja_runtime;
SQL
