# ABOUTME: Piano: giornate con orari, campi con nome, generazione calendario bilanciata
# ABOUTME: Branch deploy/gcp-cloud-run, prosegue nel worktree deploy-gcp

# Calendario: giornate, campi, generazione automatica (2026-08-07)

## Obiettivo

1. Il torneo ha giornate (data + ora inizio/fine) e campi (nome), gestiti da admin.
2. "Genera calendario" distribuisce le partite non giocate su slot stimati
   (inizio giornata + durata media partita) bilanciando giorni e campi.
3. Gironi prima, tabellone dopo, ma guidato dalla capienza: se i gironi non
   stanno nei primi giorni sforano sui successivi.

## Decisions

| # | Decision | Choice | Rationale | Revisit if |
|---|----------|--------|-----------|------------|
| 1 | Orari | stimati (inizio + slot × durata), presentati come indicativi | nel beach gli orari slittano; il contratto è ordine+campo | serve un tabellone orario rigido |
| 2 | Fasi | blocchi in ordine: round gironi, poi round tabellone; capienza per giornata | richiesta esplicita + vincolo tramonto | fasi intrecciate |
| 3 | Rigenerazione | riprogramma tutte le non giocate | scelta esplicita | orari manuali da preservare |
| 4 | Vincolo squadre | mai due partite della stessa squadra nello stesso slot: blocchi = round (team-disjoint), un blocco non condivide slot col successivo | correttezza semplice da dimostrare | serve packing più denso |
| 5 | Campo su matches | resta TEXT col nome del campo | zero migrazioni su matches, display esistente | rinomina campi a torneo in corso |
| 6 | Durata partita | colonna match_minutes sul torneo (default 40) | serve per gli slot | durata per fase |

## File

- src/lib/db.ts — tabelle tournament_days e courts; tournaments.match_minutes (ALTER guardato)
- src/lib/scheduler.ts (nuovo) — buildSchedule puro: (giornate, campi, durata, blocchi) → assegnazioni + non collocate
- src/lib/repo.ts — CRUD giornate/campi, match_minutes nei settings, generateSchedule (blocchi da round gironi + round tabellone, scrive court/scheduled_at)
- src/app/admin/page.tsx + actions.ts — card Giornate e Campi (add/remove), campo durata partita
- src/app/admin/partite/page.tsx + actions.ts — bottone Genera calendario
- src/lib/view.ts o pagine pubbliche — nota "orari indicativi"
- test: scheduler (capienza, team-disjoint, orari nei limiti, bilanciamento campi, capienza insufficiente), repo integrazione

## Budget

Fix rounds 5 (default) · write agents 1 (diretto) · reviewer 2 · finalizzazione: make check + make test-e2e verdi dopo l'ultimo edit

## Progress

- [x] Schema + scheduler puro + test (8 unit)
- [x] Repo CRUD + generateSchedule (blocchi da round, transazionale)
- [x] Admin UI (giornate, campi, durata, bottone genera)
- [x] Note pubbliche orari indicativi
- [x] Verify: 89/89, e2e, browser reale (calendario generato: 3 slot x 2 campi, round paralleli)
- [x] Review architecture: 0C/2M/3m, tutti fixati (range orari, copertura knockout, dead code, riferimenti pendenti, bound condivisi)
- [x] Deploy: revision 00002 su europe-west1, setpoint.wishew.com verificato

## Surprises & Discoveries

- Il primo click su un server action button appena dopo la navigazione puo'
  perdersi (pre-idratazione): in verifica browser servono click ripetuti o attesa.
- isValidDate col round-trip locale/UTC bocciava ogni data valida da fusi
  avanti rispetto a UTC: round-trip interamente in UTC.
- formatSchedule anteponeva "Campo" al nome campo ora libero ("Campo Campo Mare").

## Outcomes & Retrospective

**Shipped**: giornate (data+orari) e campi nominati per torneo, durata media
partita, generazione calendario con orari stimati: blocchi = round
(team-disjoint), riempimento sequenziale con rotazione campi, capienza per
giornata, partite fuori capienza segnalate. 15 test nuovi (89 totali).

**Gap noti**: rigenerazione a torneo in corso riparte dal primo slot
(tech-debt); orari presentati come indicativi per scelta.

**Lezioni**: vedi Surprises; il reviewer con probe empirici ha confermato gli
invarianti dell'algoritmo meglio di quanto avrebbero fatto altri unit test.
