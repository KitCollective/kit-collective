#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "docker-entrypoint: DATABASE_URL is required" >&2
  exit 1
fi

MIGRATIONS_DIR="/app/packages/db/migrations"

echo "docker-entrypoint: applying migrations from ${MIGRATIONS_DIR}"
node --input-type=module -e "
import { migrate } from '@kit/db';
await migrate(process.env.DATABASE_URL, '${MIGRATIONS_DIR}');
console.log('docker-entrypoint: migrations complete');
"

echo "docker-entrypoint: starting Nest on port ${PORT:-3000}"
exec node dist/main.js
