#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Seeding database (idempotent)..."
npx prisma db seed || echo "Seed skipped or already applied."

echo "Starting API..."
exec node dist/main.js
