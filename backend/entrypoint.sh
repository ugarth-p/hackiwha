#!/bin/sh

echo "--- Running entrypoint ---"

# Enable pgvector extension
echo "Enabling pgvector extension..."
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" || echo "pgvector may already exist"

# Push Prisma schema to database
echo "Pushing Prisma schema..."
npx prisma db push --accept-data-loss

echo "Database ready. Starting server..."

exec node dist/src/main.js
