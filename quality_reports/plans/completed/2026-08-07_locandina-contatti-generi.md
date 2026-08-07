# ABOUTME: Piano: locandina + info contatti sul torneo, editing contatti in admin, etichette Uomo/Donna
# ABOUTME: Branch deploy/gcp-cloud-run, prosegue nel worktree deploy-gcp

# Locandina, contatti torneo, editing contatti, generi (2026-08-07)

## Obiettivo

1. Etichette genere "Uomo/Donna" al posto di "Ragazzo/Ragazza" (DB resta M/F).
2. Admin può correggere il contatto di squadre e singoli (validato come telefono).
3. Il torneo ha info di contatto (testo, es. "Laura 348..., Manuel 328...") e
   una locandina caricabile dall'admin, mostrate al pubblico.

## Decisions

| # | Decision | Choice | Rationale | Revisit if |
|---|----------|--------|-----------|------------|
| 1 | Storage locandina | BLOB in tabella dedicata tournament_posters | sopravvive ai riavvii via Litestream; fuori da SELECT * dei tornei | locandine > ~2MB o multiple |
| 2 | Limiti upload | ≤ 2MB, jpeg/png/webp | dimensione tipica di una locandina compressa | serve il PDF |
| 3 | Dove si vede | home (immagine + contatti), form iscrizione (contatti) | è dove guardano gli iscritti | serve pagina dedicata |
| 4 | Contatti torneo | testo libero multilinea | formati eterogenei (nome + numero) | serve struttura per WhatsApp link |

## File

- src/lib/db.ts — contact_info su tournaments (ALTER guardato), tabella tournament_posters
- src/lib/repo.ts — contactInfo nei settings, get/setPoster, hasPoster, updateTeamContact/updatePlayerContact
- src/app/locandina/route.ts (nuovo) — GET dell'immagine
- src/app/admin/{actions.ts,page.tsx} — textarea contatti, upload locandina, azioni edit contatto
- src/app/admin/iscrizioni/page.tsx — form inline contatto squadra/singolo, etichette genere
- src/app/page.tsx + iscrizione pages — locandina/contatti pubblici, etichette
- test: poster roundtrip, contact update, bounds upload

## Budget

Fix rounds 5 (default) · write agents 1 (diretto) · reviewer 2 · finalizzazione: make check + test-e2e verdi dopo l'ultimo edit

## Progress

- [x] Schema + repo (tournament_posters, contact_info, update contatti)
- [x] Route locandina + admin (upload con allowlist mime e cap 2MB, edit contatti inline)
- [x] Pubblico + etichette Uomo/Donna
- [x] Verify: 72/72, e2e, browser reale (login admin, creazione torneo con locandina vera da 540KB, home con card Locandina e contatti)
- [x] Review security: 0C/1M/3m, tutti fixati (bodySizeLimit 3mb, nosniff, guardia open-redirect, cache poster)
- [x] Deploy revision 00005 + locandina reale caricata sul torneo di produzione via admin (età minima 35, contatti Laura/Manuel), verificata in home

## Surprises & Discoveries

- In produzione il torneo "Torneo di Geremeas over 35 2026" esisteva già, con
  1 singolo iscritto: aggiornato quello invece di crearne uno nuovo.
  Quell'iscritto è entrato prima del vincolo d'età, quindi ha
  age_confirmed=0 (caso tech-debt già registrato): da verificare a mano.
- Il tool di upload del browser accetta solo file condivisi con la sessione:
  la locandina va copiata nella tmp del job prima dell'upload.
- Next taglia i body delle server action a 1MB di default: qualunque
  feature di upload deve alzare serverActions.bodySizeLimit.

## Outcomes & Retrospective

**Shipped**: locandina per torneo (BLOB SQLite replicato, upload admin con
allowlist mime e cap 2MB, route /locandina con nosniff e cache in-process),
info contatti torneo su home e form, edit inline dei contatti in admin
(validazione telefonica), etichette Uomo/Donna. 5 test nuovi (72 totali).
Verificato end-to-end in browser locale e in produzione (revision 00005).

**Lezioni**: vedi Surprises; inoltre la guardia open-redirect su `back` è
stata messa in done() così tutti i call site la ereditano.
