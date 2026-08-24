#!/usr/bin/env bash
set -e

# Apply database migrations, then launch the API.
echo "Running database migrations..."
alembic -c /shared/migrations/alembic.ini upgrade head

echo "Starting Harmaal API on :8000..."
exec uvicorn api.main:app --host 0.0.0.0 --port 8000
