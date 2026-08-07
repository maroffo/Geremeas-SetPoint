#!/usr/bin/env bash
# ABOUTME: E2E smoke: builda la standalone, avvia il server vero con DB temporaneo
# ABOUTME: e verifica home, pagina login e redirect di /admin senza autenticazione

set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-3907}"
TMPDIR_E2E="$(mktemp -d)"
trap 'kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$TMPDIR_E2E"' EXIT

npm run build >/dev/null
cp -r .next/static .next/standalone/.next/static

DATABASE_PATH="$TMPDIR_E2E/e2e.db" ADMIN_PIN="pin-e2e" PORT="$PORT" \
  HOSTNAME=127.0.0.1 node .next/standalone/server.js >"$TMPDIR_E2E/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 50); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.2
done

fail() { echo "E2E FAIL: $1"; cat "$TMPDIR_E2E/server.log"; exit 1; }

code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/")
[ "$code" = "200" ] || fail "home ha risposto $code"

code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/admin/login")
[ "$code" = "200" ] || fail "/admin/login ha risposto $code"

redirect=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "http://127.0.0.1:$PORT/admin")
echo "$redirect" | grep -q "307 .*admin/login" || fail "/admin senza auth: atteso 307 verso login, avuto: $redirect"

echo "E2E OK: home 200, login 200, /admin ridirige al login"
