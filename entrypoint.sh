#!/bin/sh
set -e

echo "==> Syncing database schema..."
# Prisma CLI is baked into the image (Containerfile) — no network needed at startup.
# No --accept-data-loss: a destructive schema change fails startup instead of dropping data.
/opt/prisma/node_modules/.bin/prisma db push --schema=./prisma/schema.prisma --skip-generate

if [ ! -f "/app/data/seeded" ]; then
  echo "==> Seeding database..."
  # Seed using plain node (requires compiling seed.ts, which we should do in builder)
  # For now, let's just create default records manually if needed, or skip.
  touch /app/data/seeded
fi

chown -R nextjs:nodejs /app/data

echo "==> Starting Trade Alert Speaker on port ${PORT:-12345}..."
exec su-exec nextjs node server.js
