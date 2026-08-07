# ABOUTME: Registro del tech debt noto, un item per riga con origine
# ABOUTME: Gli item risolti si cancellano, non si spuntano

- Cookie admin derivato dal PIN (`sha256("gsp:"+PIN)`, `src/lib/auth.ts`): sostituire con sessioni server-side (token casuale + tabella in SQLite), così un cookie trapelato non rivela il PIN e si può revocare. Origine: security review del deploy GCP (branch `deploy/gcp-cloud-run`, 2026-08-07).
- Vincolo d'età inasprito a iscrizioni aperte: chi era già iscritto resta con `age_confirmed=0` e nessuno glielo richiede; servirebbe un avviso in admin o un flag sulle iscrizioni da riverificare. Origine: security review feature età (2026-08-07).
- Rigenerare il calendario a torneo in corso riparte dal primo slot della prima giornata: non salta i giorni passati né gli slot campo+orario delle partite già giocate. Va usato prima dell'inizio, o dopo aver rimosso le giornate passate. Origine: feature calendario (2026-08-07).
- Login admin senza lockout per IP: oggi solo delay 1s + log su tentativo fallito, accettabile col PIN a 8 hex; aggiungere throttling persistente se il PIN diventa più corto. Origine: stessa review.
