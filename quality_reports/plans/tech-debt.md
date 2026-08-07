# ABOUTME: Registro del tech debt noto, un item per riga con origine
# ABOUTME: Gli item risolti si cancellano, non si spuntano

- Cookie admin derivato dal PIN (`sha256("gsp:"+PIN)`, `src/lib/auth.ts`): sostituire con sessioni server-side (token casuale + tabella in SQLite), così un cookie trapelato non rivela il PIN e si può revocare. Origine: security review del deploy GCP (branch `deploy/gcp-cloud-run`, 2026-08-07).
- Login admin senza lockout per IP: oggi solo delay 1s + log su tentativo fallito, accettabile col PIN a 8 hex; aggiungere throttling persistente se il PIN diventa più corto. Origine: stessa review.
