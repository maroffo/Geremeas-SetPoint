#!/usr/bin/env bash
# ABOUTME: Avvia la standalone di Next per il full-flow Playwright, con PIN noti
# ABOUTME: e un database temporaneo ricreato vuoto a ogni run (stesso pattern dello smoke)

set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${E2E_FULL_PORT:-3908}"
DATA_DIR="${TMPDIR:-/tmp}/geremeas-e2e-full"

# Il flusso parte da "nessun torneo" e arriva al podio: il database deve essere
# vuoto anche dopo una run interrotta, quindi si ricrea qui e non a fine run.
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

npm run build >/dev/null
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static

exec env \
  DATABASE_PATH="$DATA_DIR/e2e.db" \
  ADMIN_PIN="${E2E_ADMIN_PIN:-pin-e2e-full}" \
  SCOREKEEPER_PIN="${E2E_SCOREKEEPER_PIN:-segnapunti-e2e-full}" \
  PORT="$PORT" \
  HOSTNAME=127.0.0.1 \
  node .next/standalone/server.js
