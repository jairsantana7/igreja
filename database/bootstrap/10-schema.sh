#!/bin/sh
set -eu

for migration in /migrations/*.sql; do
  echo "Applying ${migration}"
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set=ON_ERROR_STOP=1 --single-transaction --file "$migration"
done
