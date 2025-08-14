#!/bin/sh

# Usage:
#   ./scripts/migrate.sh up
#   ./scripts/migrate.sh down

set -e

COMMAND=$1

# print usage if no command
if [ -z "$COMMAND" ]; then
  echo "Usage: $0 <up|down>"
  exit 1
fi

echo "🌱 Running migrations: $COMMAND"

if [ -f .env ]; then
  echo "✅ Detected .env file, using dotenv to inject vars"
  bunx dotenv -e .env -- node ./node_modules/node-pg-migrate/bin/node-pg-migrate.js --migrations-dir src/migrations "$COMMAND"
else
  echo "✅ No .env file, sourcing DATABASE_URL from environment variables"
  export DATABASE_URL=postgres://$DB_USER:$DB_PASS@$DB_HOST:5432/$DB_NAME
  node ./node_modules/node-pg-migrate/bin/node-pg-migrate.js --migrations-dir src/migrations "$COMMAND"
fi