#!/usr/bin/env bash
# ABOUTME: E2E smoke: builda la standalone, avvia il server vero con DB temporaneo
# ABOUTME: e verifica home, login, sessioni DB (admin, segnapunti, revoca) e redirect di /admin

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

# Sessioni server-side: il cookie porta il token in chiaro, il DB ne tiene lo
# sha256. Qui si scrivono le righe direttamente (le server action non sono
# raggiungibili con curl) e si verifica che il server vero le riconosca.
DB="$TMPDIR_E2E/e2e.db"

session() { # $1 token, $2 ruolo
  node -e '
    const Database = require("better-sqlite3");
    const { createHash } = require("node:crypto");
    const [file, token, role] = process.argv.slice(1);
    const db = new Database(file);
    const now = Date.now();
    db.prepare(
      "INSERT INTO sessions (token_hash, role, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).run(createHash("sha256").update(token).digest("hex"), role, now, now + 3600000);
  ' "$DB" "$1" "$2"
}

status() { # $1 path, $2 cookie di sessione (opzionale)
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}" \
    ${2:+-H "Cookie: gsp_session=$2"} "http://127.0.0.1:$PORT$1"
}

got=$(status /admin "token-inventato")
echo "$got" | grep -q "307 .*admin/login" || fail "token inventato: atteso 307 al login, avuto: $got"

session "token-admin-e2e" admin
got=$(status /admin "token-admin-e2e")
echo "$got" | grep -q "^200" || fail "sessione admin: atteso 200 su /admin, avuto: $got"

session "token-segna-e2e" scorekeeper
got=$(status /admin/partite "token-segna-e2e")
echo "$got" | grep -q "^200" || fail "sessione segnapunti: atteso 200 su /admin/partite, avuto: $got"
got=$(status /admin "token-segna-e2e")
echo "$got" | grep -q "307 .*admin/partite" || fail "segnapunti su /admin: atteso 307 alle partite, avuto: $got"

# Revoca (quello che fa il logout): la riga sparisce, il cookie non vale più.
node -e '
  const Database = require("better-sqlite3");
  new Database(process.argv[1]).prepare("DELETE FROM sessions").run();
' "$DB"
got=$(status /admin "token-admin-e2e")
echo "$got" | grep -q "307 .*admin/login" || fail "sessione revocata: atteso 307 al login, avuto: $got"

echo "E2E OK: home 200, login 200, sessioni admin/segnapunti riconosciute, revoca e token ignoti al login"
