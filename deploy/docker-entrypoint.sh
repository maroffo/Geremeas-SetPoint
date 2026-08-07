#!/bin/sh
# ABOUTME: Entrypoint del container: ripristina il DB dalla replica GCS se assente,
# ABOUTME: poi avvia il server Next.js sotto litestream replicate

set -eu

litestream restore -if-replica-exists -if-db-not-exists "$DATABASE_PATH"

exec litestream replicate -exec "node server.js"
