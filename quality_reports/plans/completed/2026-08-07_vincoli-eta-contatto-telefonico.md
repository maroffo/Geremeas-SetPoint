# ABOUTME: Piano: vincoli d'età per torneo con dichiarazione all'iscrizione, contatto solo telefonico
# ABOUTME: Branch deploy/gcp-cloud-run, prosegue nel worktree deploy-gcp

# Vincoli d'età + contatto telefonico (2026-08-07)

## Obiettivo

1. Un torneo può dichiarare età minima e/o massima (es. over 35, under 18).
2. Se il torneo ha vincoli d'età, l'iscrizione richiede un checkbox di
   dichiarazione: il capitano dichiara per tutta la squadra (riserve incluse),
   il singolo per sé. La dichiarazione viene salvata (age_confirmed).
3. Il contatto diventa solo telefonico, validazione permissiva
   (+, cifre, spazi, trattini, punti, parentesi; almeno 8 cifre).

## Decisions

| # | Decision | Choice | Rationale | Revisit if |
|---|----------|--------|-----------|------------|
| 1 | Forma vincolo età | min e max opzionali per torneo | copre over e under | mai serve un range doppio per categoria |
| 2 | Chi dichiara (squadra) | un checkbox, il capitano per tutti | form snello da smartphone | servono dichiarazioni individuali firmate |
| 3 | Validazione telefono | permissiva, ≥8 cifre | meno iscrizioni respinte | troppi contatti inutilizzabili |
| 4 | Persistenza dichiarazione | age_confirmed su teams e players | tracciabilità in caso di contestazione | — |
| 5 | Migrazione schema | ALTER TABLE guardato da PRAGMA table_info | DB di produzione già esistente su GCS | si adotta un vero migration tool |

## File

- src/lib/db.ts — colonne nuove nello SCHEMA + runMigrations() guardata (esportata per i test)
- src/lib/validation.ts (nuovo) — validatePhone, ageRequirementLabel
- src/lib/repo.ts — TournamentRow/Settings con minAge/maxAge; registerTeam/registerSingle con ageConfirmed, enforcement server-side
- src/app/admin/actions.ts + form torneo admin — campi età min/max
- src/app/iscrizione/{squadra,singolo}/page.tsx — label/input telefono, banner requisito + checkbox condizionale
- src/app/iscrizione/actions.ts — validazione telefono + checkbox
- test: validation, repo (enforcement + migrazione)

## Budget

| Limite | Valore |
|---|---|
| Fix rounds | 5 (default) |
| Write agents concorrenti | 1 (lavoro diretto, workstream unico) |
| Sub-agent totali run | 4 (reviewer routed) |
| Evidenza minima per finalizzare | make check + make test-e2e verdi dopo l'ultimo edit |

## Progress

- [x] Schema + migrazione + repo (2026-08-07 ~15:00)
- [x] validation.ts + test
- [x] Admin form
- [x] Form iscrizione + actions
- [x] Verify: make check 66/66, e2e smoke, browser reale (screenshot form squadra/singolo, submit end-to-end con age_confirmed=1 nel DB)
- [x] Review security: 0C/0M/3m, tutti e tre fixati o registrati (length cap telefono, race migrazione, retroattività in tech-debt)
- [x] Review architecture: 0C/1M/3m; Major (age_confirmed split-brain) e tutti i minor fixati, 67/67 test
- [x] Commit 899e2b8 + redeploy: revision 00004 in traffico, form 200, log senza errori (migrazione passata sul DB di produzione)

## Surprises & Discoveries

- Il server standalone di Next fa `process.chdir` nella propria directory:
  un DATABASE_PATH relativo punta a un DB diverso da quello atteso. In
  produzione il Dockerfile usa il path assoluto /data/geremeas.db, nessun
  impatto; morso solo in verifica locale.

## Outcomes & Retrospective

**Shipped**: vincoli d'età min/max per torneo (admin), dichiarazione
obbligatoria e persistita all'iscrizione (players.age_confirmed autoritativo,
riepilogo su teams), contatto solo telefonico validato in repo. 12 test nuovi
(67 totali), verificato in browser reale e in produzione (revision 00004).

**Gap noti**: riverifica degli iscritti se il vincolo viene inasprito a
iscrizioni aperte (tech-debt); nessuna raccolta della data di nascita, per
scelta: è un'autodichiarazione.

**Lezioni**:
- Il server standalone Next fa chdir: DATABASE_PATH va sempre assoluto.
- Mettere gli invarianti in repo.ts (checkContact come checkAgeDeclaration)
  e non solo nelle actions: la review l'ha chiesto per lo stesso motivo per
  cui c'erano già checkAgeBounds lì.
- La coppia SCHEMA/MIGRATIONS va derivata da costanti condivise, il drift
  delle DDL non ha test che lo becchi.
