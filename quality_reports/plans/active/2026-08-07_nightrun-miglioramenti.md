# ABOUTME: ExecPlan del night-run: 10 miglioramenti (quick win pubblici, riposo scheduler, sessioni+ruoli, riempi-buchi, archivio, ops, e2e Playwright) più bugfix propagazione tabellone.
# ABOUTME: Meccanismo chiave: fasi con deploy incrementali; ogni invariante di scheduling resta "blocchi=round team-disjoint, mai partite perse per il riposo".

# Night run miglioramenti Geremeas SetPoint (analisi in-sessione)

**Repo:** Geremeas-SetPoint, branch `feat/nightrun` off `deploy/gcp-cloud-run` | **Issue:** in-session analysis (2026-08-07) | **Refs:** PR #2, quality_reports/reviews/2026-08-07_*.md, quality_reports/plans/tech-debt.md
**Origin:** Max, notte 07→08/08; torneo live lunedì 10/08 su setpoint.wishew.com. Analysis + second opinion 2-lab (Gemini/DeepSeek; Claude isolato 401), consenso su scoping pagina squadra, ruolo scorekeeper con lettura, riposo con membership, riempi-buchi.

## Analysis (verified 2026-08-07 on deploy/gcp-cloud-up@815e61f, do not re-derive)

- Auth: cookie `gsp_admin` = sha256("gsp:"+PIN) (src/lib/auth.ts:18-20), nessuna sessione server-side; 23 server action tutte `requireAdmin()` (src/app/admin/actions.ts); pagine admin gated da `requireAdmin` (es. admin/partite/page.tsx) e layout da `isAdmin`.
- Scheduler: `buildSchedule` pura, blocchi `{matchIds}` SENZA membership squadre (src/lib/scheduler.ts:41-43); batch per slot = `queue.splice(0, courts.length)` (scheduler.ts:104), `slotCursor++` per blocco → round adiacenti possono dare alla stessa squadra due slot consecutivi (zero riposo). Invarianti già verificati con probe in review: team-disjoint per slot, round tabellone ordinati (quality_reports/reviews/2026-08-07_calendario-round1.md).
- Rigenerazione: `generateSchedule` (src/lib/repo.ts:405+) fa clear+assign di TUTTE le pending ripartendo dal primo slot; orari salvati naive "YYYY-MM-DDTHH:MM" intesi Europe/Rome, server UTC. Tech-debt registrato.
- Bug pre-esistente (trovato da DeepSeek, da verificare RED in W0): `clearScore` non annulla la propagazione di `propagateKnockout` (src/lib/repo.ts, zona 497-520): annullando il risultato di una semifinale, il vincitore resta scritto nel round successivo.
- Home: `getActiveTournament` = ultimo torneo per id (src/lib/repo.ts:145-147); nessuna pagina per edizioni passate; contact_info renderizzato come testo puro (src/app/page.tsx:104-107, iscrizione/*:56-59).
- Dati sensibili in players: `skill`, `contact`, `age_confirmed` (src/lib/repo.ts PlayerRow) — MAI esporli su pagine pubbliche.
- E2E attuale: smoke curl (scripts/e2e-smoke.sh); nessun test browser del flusso completo.
- Out of scope stanotte: refactor per-campo dello scheduler per collision-avoidance nel full-regenerate (coperto dalla modalità riempi-buchi; follow-up), notifiche push/PWA, multi-tenancy, lockout persistente su DB.

### Second-opinion hard requirements folded in
1. Pagina squadra scoped: solo torneo attivo E squadra `active`, 404 altrimenti; niente skill/contact/age_confirmed (Gemini+DeepSeek, must-fix): senza scoping l'enumeration espone edizioni passate e squadre pending/withdrawn.
2. Scorekeeper con accesso in LETTURA: view partite accessibile a entrambi i ruoli, action punteggi (save/forfeit/clear) aperte al ruolo, le altre 20 admin-only, rendering role-aware (DeepSeek, must-fix): altrimenti il ruolo è inutilizzabile.
3. Riposo: `buildSchedule` riceve `Map<matchId, teamIds>`; prima riordino interno al blocco successivo (riposo a costo zero), buffer di uno slot solo se necessario e possibile; doppia passata (con riposo → se unplaced>0 rigira senza) così il riposo non costa MAI partite (Gemini alternativa B + DeepSeek lookahead).
4. A torneo in corso NIENTE full-regenerate: modalità "riempi i buchi": solo pending con scheduled_at NULL, collocate DOPO l'ultimo slot occupato (played o scheduled), nessun clear (DeepSeek; copre anche il freeze-window di Gemini). Full regenerate resta per pre-torneo con avviso esplicito.
5. Timezone: helper `nowInRome()` con Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Rome", hourCycle:"h23"}) e formatToParts; confronti solo lessicali su stringhe zero-padded; MAI `new Date()` su stringhe naive per confronti; unit test sui confini DST (DeepSeek, must-fix).
6. Sessioni DB con `sha256(token)` in tabella, non il token in chiaro (DeepSeek); JWT stateless RESPINTO: la revocabilità è l'obiettivo (il logout deve revocare davvero), e un denylist di JWT sarebbe di nuovo stato su DB.
7. SCOREKEEPER_PIN: generato (≥8 hex), più lockout in-memory 5 fallimenti → 15 min sul login (corretto su single instance) (DeepSeek).
8. Auto-refresh: gated su `document.visibilityState === "visible"`, niente refresh sovrapposti; attivo anche sulla pagina squadra (Gemini+DeepSeek).
9. Deploy sequencing: il deploy delle sessioni (W4) va fatto e VERIFICATO subito (re-login post-rollout), mai lasciato a metà finestra (DeepSeek).

## Design decisions (locked)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Pagina squadra | pubblica, `/squadra/[id]`, scoped torneo attivo + status active, 404 altrimenti; espone SOLO nome squadra, nomi/genere giocatori, partite (orario, campo, risultato), classifica girone | hard req 1 |
| 2 | Auth | sessioni server-side in SQLite: cookie = token 32B random, DB salva sha256(token), scadenza 30gg, revoca su logout, cleanup lazy al login; nessun ponte dai vecchi cookie (re-login una tantum) | revocabilità reale; hard req 6 |
| 3 | Ruoli | binario: admin (tutto) / scorekeeper (SOLO saveScore, forfeit, clearScore + lettura pagina partite); login unico che riconosce quale PIN è stato inserito | hard req 2; caso reale "PIN per il campo" |
| 4 | Riposo scheduler | membership match→teams in buildSchedule; riordino interno al blocco poi buffer; doppia passata: mai unplaced per il riposo | hard req 3 |
| 5 | Calendario in corsa | nuova azione "Completa calendario" (riempi-buchi, nessun clear, parte dopo l'ultimo slot occupato); full regenerate invariato ma con avviso "solo a torneo non iniziato" | hard req 4 |
| 6 | Timezone | helper nowInRome() con Intl, confronti lessicali, test DST | hard req 5 |
| 7 | Auto-refresh | client component, router.refresh() ogni 60s, solo tab visibile, stati groups/knockout, su home e pagina squadra | hard req 8 |
| 8 | Contatti cliccabili | parser dei numeri in contact_info → link `https://wa.me/<E164>` + `tel:`; testo non riconosciuto resta testo | telefoni già pubblici per scelta dell'organizzatore |
| 9 | Archivio | `/storico` (lista tornei finished) + `/storico/[id]` read-only riusando buildTournamentView; nessun dato sensibile | continuità anno su anno |
| 10 | E2E browser | Playwright, target `make test-e2e-full` separato dal check rapido; spec unico flusso completo | tempo di run contenuto |
| 11 | Uptime | Cloud Monitoring uptime check su https://setpoint.wishew.com/ + alert email massimiliano.aroffo@hikmaai.io | costo zero, copre i 3 giorni di gara |
| 12 | Bugfix propagazione | clearScore su partita knockout azzera team_a/team_b/winner dei round dipendenti già propagati (e loro punteggi se presenti? NO: se il dipendente ha punteggi, clearScore è RIFIUTATO con errore esplicito) | integrità tabellone senza cancellazioni a cascata silenziose |

Append-only after this point. The implementing session does NOT relitigate; execution-time decisions get NEW rows in ## Decisions below.

## Workstreams & tasklist

### W0 - REPRODUCE (bugfix propagazione, mandatory first)
- [x] W0.1 Test che fallisce sul codice attuale: torneo knockout 4 squadre, gioca le due semifinali, verifica finale popolata; `clearScore` sulla semifinale 1; ASSERT: la finale NON contiene più il vincitore annullato (assertion legata a `matches.team_a/team_b` del round 2, non a uno status). DEVE fallire (il vincitore resta): registra l'output rosso qui (`fails_before_fix=true`). Diventa verde con W1.1 nello stesso commit.

### W1 - bugfix propagazione tabellone
- [x] W1.1 `clearScore`: se la partita è knockout e ha dipendenti popolati, rimuovi il team propagato dai dipendenti SENZA punteggi; se un dipendente ha già punteggi, throw "Annulla prima il risultato della partita successiva". File: src/lib/repo.ts (clearScore + propagateKnockout inverso). Done: W0.1 verde + test del path rifiuto.

### W2 - quick win pubblici (deploy A a fine W2)
- [x] W2.1 Componente ContactLinks: parse dei numeri italiani in contact_info (riuso della logica permissiva di validation.ts), render come link wa.me (numero E.164 con +39 default) e tel:; righe non-numero restano testo. Sostituisce i render in src/app/page.tsx e nelle due pagine iscrizione. Test unit sul parser.
- [x] W2.2 AutoRefresh client component (decisione 7): mount in home e pagina squadra; nessun refresh se tab nascosto o refresh precedente in volo.
- [x] W2.3 `/squadra/[id]` (decisione 1): repo `getTeamPublicView(teamId)` che applica lo scoping in query; pagina con partite della squadra + classifica girone; link dalle liste squadre in home. Test repo: 404-path (torneo vecchio, withdrawn, pending), niente campi sensibili nel payload.
- [ ] W2.4 Deploy A + verifica prod (home, una pagina squadra, link wa.me).

### W3 - riposo scheduler (deploy B con W5)
- [x] W3.1 buildSchedule: firma con `teamsByMatch: Map<number, number[]>`; riordino interno al blocco (le partite di squadre che hanno giocato nello slot precedente vanno in fondo alla coda del blocco); se il back-to-back persiste e restano slot sufficienti (lookahead `remainingSlots > ceil(remainingMatches/courts)`), inserisci UNO slot buffer; doppia passata come rete di sicurezza (se pass-1 produce unplaced, usa pass-2 senza riposo). Test: capienza larga → zero back-to-back; capienza stretta → stesso placed count di oggi; proprietà su pool casuali.
- [x] W3.2 generateSchedule passa la membership (team_a/team_b delle pending).

### W4 - sessioni + ruoli (deploy C subito verificato)
- [x] W4.1 Tabella `sessions` (id, token_hash UNIQUE, role, created_at, expires_at) in db.ts (CREATE IF NOT EXISTS, niente ALTER); auth.ts riscritto: createSession/validateSession/revokeSession, cookie col token raw, DB con sha256; loginAdmin accetta ADMIN_PIN→admin, SCOREKEEPER_PIN→scorekeeper (secret opzionale: assente = ruolo disattivo); lockout in-memory (Map ip→{fails,until}) 5 tentativi → 15 min; cleanup lazy delle scadute al login. Test: login/logout/revoca, ruolo, lockout, scadenza.
- [x] W4.2 requireAdmin() invariato per le 20 action di gestione; nuovo requireScorer() (admin O scorekeeper) per saveScore/forfeit/clearScore E per la view partite; layout admin role-aware (nav ridotta per scorekeeper: solo Partite); admin/partite nasconde a scorekeeper i form scheduleMatch e il bottone genera. Test: scorekeeper può salvare un punteggio, NON può creare tornei (assert error).
- [ ] W4.3 Secret GCP `geremeas-scorekeeper-pin` (openssl rand -hex 4) + `--set-secrets SCOREKEEPER_PIN=...` nel comando deploy documentato.
- [ ] W4.4 Deploy C, re-login verificato in prod con entrambi i PIN, PIN segnapunti riportato a Max.

### W5 - calendario: riempi-buchi + timezone
- [x] W5.1 Helper `nowInRome()` + `todayInRome()` (decisione 6) in scheduler.ts o lib dedicata; unit test DST (2026-03-29, 2026-10-25) con clock iniettabile.
- [x] W5.2 repo.fillScheduleGaps(tournamentId): pending con scheduled_at NULL, blocchi come oggi, MA slot disponibili = quelli strettamente successivi all'ultimo slot occupato (max su scheduled_at di partite played+scheduled del torneo) e comunque > nowInRome(); nessun clear. Azione admin "Completa calendario" accanto a "Genera": Genera resta full con testo "da usare a torneo non iniziato". Test: partite giocate intatte, nuove partite solo in coda, niente collisioni campo+orario, niente orari passati.
- [ ] W5.3 Deploy B (W3+W5 insieme) + verifica prod.

### W6 - archivio edizioni (deploy D con W6 finale)
- [x] W6.1 `/storico`: tornei status=finished (anno, nome, podio da buildTournamentView); `/storico/[id]`: vista read-only (classifiche, tabellone, risultati), 404 se non finished; link nel footer/home. Niente contatti né dati player sensibili. Test repo per lo scoping.
- [ ] W6.2 Deploy D + verifica prod.

### W7 - operatività (no deploy)
- [ ] W7.1 Prova di restore: litestream restore dal bucket su DB temporaneo locale, apri con sqlite e verifica torneo+iscritti presenti; incolla l'output in Surprises come evidenza.
- [ ] W7.2 Uptime check Cloud Monitoring su https://setpoint.wishew.com/ + notification channel email + alert policy. Evidenza: describe del check.

### W8 - Playwright full-flow (no deploy)
- [ ] W8.1 Dipendenza dev @playwright/test + chromium; spec unico: iscrivi 4 squadre (con dichiarazione età se richiesta) → admin conferma → genera gironi → genera calendario → inserisci tutti i punteggi → genera tabellone → punteggi → verifica podio in home. Server standalone su porta dedicata con DB temporaneo (pattern di scripts/e2e-smoke.sh). Target `make test-e2e-full`; NON entra in `check`.

### W9 - docs + follow-ups
- [ ] W9.1 deploy/README.md aggiornato (SCOREKEEPER_PIN, uptime check, riempi-buchi vs genera); README utente (pagina squadra, storico); tech-debt.md: rimossa la riga rigenerazione (chiusa da W5), aggiunta eventuale coda.
- [ ] W9.2 Follow-up DRAFTED qui (filed a PR time): (a) refactor per-campo di buildSchedule per collision-avoidance nel full-regenerate — what: modello slot per (giorno,orario,campo) con occupazione; where: src/lib/scheduler.ts + repo.generateSchedule; done-when: full-regenerate a torneo in corso non colloca mai su (campo,orario) di partite giocate, test dedicato; verify: unit + integrazione; label proposta agent:ready. (b) QR/short-link pagina squadra — what: rotta breve + QR generato in admin; done-when: QR scaricabile per squadra; label agent:needs-spec (grafica da decidere).

## E2E matrix

| # | Surface | Scenario | Assertion | Depth |
|---|---------|----------|-----------|-------|
| 1 | clearScore knockout | annulla semifinale con finale vuota; poi con finale già giocata | vincitore rimosso dalla finale; secondo caso rifiutato con messaggio | 3★ (edge: 3º posto; error: dipendente con punteggi) |
| 2 | /squadra/[id] | squadra attiva del torneo attivo | partite+classifica, nessun campo skill/contact/age nel HTML | 3★ (edge: id inesistente→404; error: withdrawn/torneo vecchio→404) |
| 3 | ContactLinks | contact_info con 2 numeri + testo | 2 link wa.me con +39, testo invariato | 2★ |
| 4 | Riposo | capienza larga (3 giorni × 2 campi, 6 squadre) | nessuna squadra in slot consecutivi | 3★ (edge: capienza stretta → placed identico a oggi; proprietà su pool random) |
| 5 | Sessioni | login admin, logout, riuso token revocato | token revocato → redirect login | 3★ (edge: scadenza; error: lockout dopo 5 fail) |
| 6 | Ruoli | scorekeeper salva punteggio; tenta createTournament | punteggio ok; create rifiutato | 3★ (edge: nav ridotta; error: pagina gestione → redirect) |
| 7 | Riempi-buchi | torneo con 2 giocate + 2 pending NULL | pending dopo l'ultimo slot occupato, giocate intatte | 3★ (edge: nessuno slot libero → unplaced onesto; error: senza giornate → messaggio) |
| 8 | nowInRome | confronto attorno a DST ottobre | skip slot corretto ±1h | 2★ |
| 9 | /storico | torneo finished + attivo | finished listato, attivo no; /storico/[attivo] → 404 | 2★ |
| 10 | Auto-refresh | tab nascosto | nessuna richiesta refresh | 1★ (verificato in code review: guard visibilityState) |
| 11 | Playwright full-flow | iscrizione→podio | podio visibile in home a fine flusso | 2★ |
| 12 | Uptime check | check attivo | describe restituisce il check su setpoint.wishew.com | 1★ |
| 13 | Restore drill | restore da bucket | DB ripristinato contiene torneo e iscritti | 1★ (manuale, output in Surprises) |

COVERAGE: 13/13 paths (100%)

### Exhaustiveness note
La matrice è l'unione di: (superfici nuove del run) × (happy path + il loro edge/error più probabile in gara). Le combinazioni interne dello scheduler (pool×capienze) sono coperte dalla proprietà random di W3.1, non enumerate; le 23 action × 2 ruoli sono coperte dal campione riga 6 + review del mapping requireAdmin/requireScorer (non si enumerano 46 combinazioni).

## DoD

| # | Criterion | Command | Expected | Auto |
|---|-----------|---------|----------|------|
| 1 | (bugfix) REPRODUCE red then green | `npx vitest run src/lib/__tests__/knockoutClear.test.ts` | exit 0 sul codice fixato (output rosso pre-fix registrato in W0.1) | yes |
| 2 | Fresh pristine VERIFY after the LAST edit | `make check && make test-e2e` | exit 0 | yes |
| 3 | Playwright full-flow | `make test-e2e-full` | exit 0 | yes |
| 4 | (test-heavy) Depth + COVERAGE computed, gaps: 0 | - | matrice completa | no |
| 5 | Review fleet: security + architecture + test (routing standard) | - | CRITICAL/MAJOR fixed, re-verified | no |
| 6 | PR verso deploy/gcp-cloud-run open, NOT merged | - | `SCORE: <n>/100 (threshold: 90, gate: pr)` con evidenza fresca | no |
| 7 | Follow-up issues filed and linked | - | filed con label triage | no |
| 8 | Plan updated after every task | - | Progress/Surprises/Decisions aggiornati | no |
| 9 | Deploy A/B/C/D verificati in prod | `curl -s -o /dev/null -w "%{http_code}" https://setpoint.wishew.com/` | 200 dopo ogni fase, più verifica funzionale della fase | no |
| 10 | Uptime check esistente | `gcloud monitoring uptime list-configs --project playground-maroffo --format="value(displayName)"` | contiene il check setpoint | yes |

## Progress
- [x] Analysis + second opinion + plan (2026-08-07, planning session; Claude isolato 401, sintesi Gemini+DeepSeek)
- [x] W0-W1 bugfix propagazione (2026-08-07: test RED→GREEN, `npm test` 97/97, `tsc --noEmit` pulito)
- [x] W2.1-W2.3 quick win pubblici (2026-08-07: `npm test` 113/113, `tsc --noEmit` pulito, probe HTTP sul server standalone verde)
- [ ] W2.4 deploy A
- [x] W3.1-W3.2 riposo scheduler (2026-08-08: `npm test` 119/119, `tsc --noEmit` pulito, `make test-e2e` verde)
- [x] W4.1-W4.2 sessioni + ruoli (2026-08-08: `npm test` 136/136, `tsc --noEmit` pulito, `make test-e2e` verde con le nuove probe di sessione)
- [ ] W4.3-W4.4 secret SCOREKEEPER_PIN + deploy C
- [x] W5.1-W5.2 riempi-buchi + timezone (2026-08-08: `npm test` 157/157, `npx next typegen && npx tsc --noEmit` pulito, `make test-e2e` verde, probe di rendering sulla pagina partite verde)
- [ ] W5.3 deploy B (W3+W5)
- [x] W6.1 archivio edizioni (2026-08-08: `npm test` 166/166, `npx next typegen && npx tsc --noEmit` pulito, `make test-e2e` verde, probe HTTP dello storico verde)
- [ ] W6.2 deploy D
- [ ] W7 operatività
- [ ] W8 Playwright
- [ ] W9 docs + follow-ups
- [ ] Review round + fixes
- [ ] PR + SCORE
- [ ] Close-out (plan → completed/, retrospettiva)

## Surprises & Discoveries

### W0 REPRODUCE (2026-08-07)

`REPRODUCE: script=src/lib/__tests__/knockoutClear.test.ts fails_before_fix=true`

`npx vitest run src/lib/__tests__/knockoutClear.test.ts` sul codice pre-fix (repo.ts:1049 clearScore):

```
 ❯ src/lib/__tests__/knockoutClear.test.ts (5 tests | 4 failed) 9ms
     × rimuove il vincitore propagato dalla finale e il perdente dalla finalina 4ms
     × rifiuta l'annullamento se la finale è già stata giocata 2ms
     × rifiuta l'annullamento se la finalina è già stata giocata 1ms
     × rifiuta l'annullamento se il turno successivo è stato assegnato a tavolino 1ms

 FAIL > rimuove il vincitore propagato dalla finale e il perdente dalla finalina
AssertionError: expected 2 to be null
 ❯ src/lib/__tests__/knockoutClear.test.ts:86:31
     85|     const finalAfter = repo.getMatch(final.id)!;
     86|     expect(finalAfter.team_a).toBeNull();

 FAIL > rifiuta l'annullamento se la finale è già stata giocata
AssertionError: expected [Function] to throw an error
 ❯ src/lib/__tests__/knockoutClear.test.ts:100:48

 Test Files  1 failed (1)
      Tests  4 failed | 1 passed (5)
```

Dopo W1.1 (`passes_after_fix=true`):

```
 Test Files  1 passed (1)      # knockoutClear.test.ts, 5 passed (5)
 Test Files  13 passed (13)    # npm test completo, 97 passed (97)
```

Sorpresa rispetto all'analisi: la finalina 3º/4º **esiste** (`generateKnockout` la crea a repo.ts:1158-1161 quando `rounds >= 2`) e `propagateKnockout` ci propaga anche il **perdente** della semifinale (repo.ts:1086-1094). Quindi l'annullamento di una semifinale deve disfare DUE propagazioni, non una: vincitore nella finale e perdente nella finalina. La riga 1 della E2E matrix ("edge: 3º posto") è quindi un caso reale, non ipotetico, ed è coperta dal test principale.

Trappola d'ambiente per le sessioni successive: in un worktree fresco `npx tsc --noEmit` fallisce con `src/app/layout.tsx(10,50): error TS2304: Cannot find name 'LayoutProps'`. Non è codice rotto: `LayoutProps` è un tipo globale generato da Next in `.next/types/**`, incluso da tsconfig.json:29. Si risolve con `npx next typegen` (o un qualsiasi build/dev) prima di `make check`.

### W2 quick win (2026-08-07)

La pagina squadra era **irraggiungibile durante il torneo**. Il probe HTTP sul server standalone (DB seedato, quindi torneo in stato `groups`) è fallito su `home senza link alla pagina squadra`: le liste squadre della home stanno dentro `tournament.status === "registration"`, e a torneo iniziato spariscono. L'unico elenco di squadre che resta visibile nei giorni di gara è la classifica dei gironi. Rimediato con una prop opzionale `linkTeams` su `StandingsTable` (attiva su home e pagina squadra, non in admin): in classifica ci sono per costruzione le squadre attive del torneo in corso, cioè esattamente quelle con una pagina che risponde 200.

Evidenza (probe con seed + `contact_info` di prova, `.next/standalone`):

```
squadra sotto test: 4
PROBE OK: squadra 4 200 e pulita, 404 su id inesistente/non numerico, link wa.me e tel in home
```

Il probe verifica anche il vincolo di sicurezza sull'HTML servito, non solo sul payload: nessuna occorrenza di `skill`, `age_confirmed`, `contact` né di un numero di telefono nella pagina squadra.

### W3 riposo scheduler (2026-08-08)

Con il lookahead calcolato **esatto** (fabbisogno = somma di `ceil(partite_blocco / campi)` sul blocco corrente e su tutti i successivi, non `ceil(totale/campi)`) la differenza `slot rimasti - slot necessari` è **invariante** rispetto al piazzamento di un batch: cala di 1 da entrambi i lati. Il cuscinetto si inserisce solo con differenza strettamente positiva, quindi la passata con riposo non può mai finire gli slot prima di quella senza. Conseguenza: la pass-2 è una rete di sicurezza che, con questa implementazione, non si attiva mai. Resta in piedi perché la garanzia dipende dall'esattezza del lookahead, cioè esattamente la cosa che una modifica futura può rompere in silenzio; il test di equivalenza sui pool casuali (`placed` identico con e senza membership, 120 seed) è la verifica che la sostituisce sul piano osservabile.

Il riposo **costa calendario**, non partite. Il test d'integrazione dei gironi lo ha reso visibile subito:

```
AssertionError: expected Set{ '2026-08-10', '2026-08-11' } to deeply equal Set{ '2026-08-10' }
```

6 squadre in 2 gironi da 3: in un girone da 3 le stesse squadre tornano in campo a ogni round, quindi tra round 1 e round 2 il cuscinetto è obbligatorio e il round 3 scivola sulla giornata dopo (18:00 e 19:20 il primo giorno, 18:00 il secondo). L'attesa vecchia ("tutte nella prima giornata") era un artefatto del back-to-back, non un invariante: sostituita con gli orari attesi più l'asserzione esplicita di riposo. Da tenere presente per la comunicazione a Max: a parità di giornate configurate il calendario si allunga, non si perdono partite.

Sorpresa utile per il tabellone: al momento di `generateSchedule` i round di tabellone oltre il primo hanno `team_a/team_b` a NULL (non ancora propagati), quindi restano senza membership e senza vincolo di riposo. Nessun cuscinetto sprecato lì, e il test del tabellone (finale dopo le semifinali) resta invariato.

### W4 sessioni + ruoli (2026-08-08)

Lo smoke e2e **non faceva login**, contrariamente a quanto dava per scontato il brief: verificava home 200, login 200 e il 307 di `/admin`, mai una sessione autenticata. E non poteva farlo: `loginAction` è una server action, richiamabile solo con l'header `Next-Action: <id generato a build time>`, che non si estrae in modo stabile da uno script curl. La verifica end-to-end delle sessioni è quindi fatta scrivendo la riga in `sessions` direttamente sul DB temporaneo del server sotto test (stesso file, WAL) e presentando il token nel cookie. Copre esattamente la parte nuova: il server vero rilegge la tabella, ricalcola lo sha256 e decide.

```
E2E OK: home 200, login 200, sessioni admin/segnapunti riconosciute, revoca e token ignoti al login
```

Le probe aggiunte: token inventato → 307 login; sessione admin → 200 su `/admin`; sessione segnapunti → 200 su `/admin/partite` ma 307 verso `/admin/partite` su `/admin`; riga cancellata (quello che fa il logout) → 307 login.

Il progetto **non aveva un `vitest.config`**: senza alias `@/` nessun test poteva importare un modulo sotto `src/app`, quindi le server action non erano testabili affatto (finora i test stanno tutti in `src/lib`). Aggiunto `vitest.config.mts` con il solo alias (estensione `.mts` e non `.ts`: con `package.json` senza `"type": "module"` Vite avvisa a ogni run che sta caricando ESM come CommonJS, e l'output di `npm test` deve restare pulito). Da lì `src/app/admin/__tests__/actions.test.ts` esegue le action vere contro un DB temporaneo, con `redirect()` mockato in modo che **lanci**: col mock precedente (una `vi.fn` muta) la guardia avrebbe ridiretto e l'azione sarebbe proseguita lo stesso, cioè il test avrebbe mostrato verde su un'autorizzazione bypassata.

Limite noto e accettato del lockout: vive in memoria, quindi un riavvio dell'istanza Cloud Run azzera i contatori. Con `--max-instances 1` è corretto rispetto alla concorrenza, non alla persistenza; il lockout persistente su DB era già fuori scope (riga "Out of scope stanotte").

### W5 riempi-buchi + timezone (2026-08-08)

I due cambi d'ora del 2026 si comportano in modo diverso e i test li asseriscono
entrambi in modo esplicito (istante UTC → ora di parete a Roma):

```
2026-03-29T00:30Z → "2026-03-29T01:30"   (CET, +1)
2026-03-29T01:30Z → "2026-03-29T03:30"   (CEST, +2: le 02:30 locali non esistono)
2026-10-25T00:30Z → "2026-10-25T02:30"   (CEST, +2)
2026-10-25T01:30Z → "2026-10-25T02:30"   (CET, +1: la stessa ora di parete due volte)
```

La sorpresa utile è la seconda coppia: a ottobre due istanti diversi danno la
**stessa** stringa. Non è un difetto dell'helper, è l'ora di parete: e siccome
`scheduled_at` è anch'esso ora di parete, il confronto lessicale resta corretto
proprio perché entrambi i lati vivono nella stessa ambiguità. Un'ora ripetuta
nel mezzo di una notte d'ottobre non tocca un torneo che gioca di pomeriggio, e
qualunque tentativo di disambiguare (offset, UTC) richiederebbe di cambiare
anche il formato salvato: il piano lo esclude.

Il riempi-buchi ha reso visibile un buco del riposo che il full-regenerate non
poteva avere: la nuova generazione parte da uno slot **attaccato** all'ultimo
già occupato, e le squadre di quello slot non sono in `teamsBySlot` (le loro
partite non sono in questa passata). Senza correzione, in un torneo con l'ultimo
round alle 19:20 le partite completate finivano alle 20:00, cioè esattamente il
back-to-back che W3 aveva tolto. Rimediato con un sesto parametro opzionale
`busyBefore` su `buildSchedule` (decisione 43): il chiamante lo passa solo se il
primo slot libero è davvero adiacente all'ultimo occupato, e da lì il cuscinetto
e il lookahead esistenti fanno il resto. Con il fix, le stesse partite vanno
alle 20:40.

La finestra utilizzabile si ottiene tagliando le **giornate**, non filtrando gli
slot dentro `buildSchedule` (decisione 40): `daysAfter` sposta l'inizio della
giornata in corso di un multiplo esatto di `match_minutes`, quindi la griglia
oraria resta quella del calendario completo e le partite aggiunte in corsa
cadono sugli stessi orari che avrebbero avuto da una generazione da zero.

Evidenza di rendering (server standalone, DB seedato con un torneo in stato
`groups`, una partita in calendario e una senza orario):

```
PROBE OK: admin vede Completa calendario + Genera con avviso, segnapunti no
```

### W6 archivio edizioni (2026-08-08)

Riusare `buildTournamentView` per la pagina d'archivio significa **restituire la
riga del torneo e le righe delle squadre**, cioè esattamente i due posti dove
vivono `contact_info`, `contact` e `age_confirmed`. Non è una preoccupazione
teorica: rimettendo la riga del torneo nella vista (`...t` in
`buildArchiveView`) il test diventa rosso citando il numero di telefono.

```
AssertionError: expected '{"id":1,"name":"Edizione conclusa","y…' not to contain '3701234567'
Received: ... "contact_info":"Info al 3701234567" ...
```

Da qui `ArchiveView`: stesse strutture della home (classifiche, `MatchView`,
podio, mappa dei nomi) meno `tournament` e meno i `teams` dei gironi.
`buildTournamentView` resta il motore, la vista d'archivio è il filtro.

Seconda trappola, presa prima di spedire: `StandingsTable` accetta `linkTeams`,
che nella home rimanda a `/squadra/[id]`. Quella pagina è scoped al torneo
**attivo** (decisione 20), quindi in una classifica d'archivio ogni nome
sarebbe stato un link a un 404. Nell'archivio `linkTeams` non si passa, e la
probe lo verifica sull'HTML servito (nessuna occorrenza di `squadra/`).

Terza: `podium()` legge solo partite di tabellone, quindi un torneo
`groups_only` concluso finisce in archivio **senza podio**. È lo stesso
comportamento della home (che mostra il podio solo se `podium.first` esiste) e
resta così: dedurre il vincitore dalle classifiche è ambiguo con più gironi.

Evidenza (server standalone, DB seedato con un'edizione conclusa e una in
corso):

```
torneo concluso: 1, torneo in corso: 2
PROBE OK: /storico lista solo i finished, dettaglio 200 e pulito, 404 su torneo in corso/id ignoto, link in home
```

## Decisions
(append-only; execution-time decisions land here)

| # | Decision | Choice | Rationale | Revisit if |
|---|----------|--------|-----------|------------|
| 13 | (W1.1) Cosa conta come "dipendente già giocato" per il rifiuto | `status != 'scheduled'` **oppure** esistono righe in `set_scores` | il forfait scrive set_scores e `status='forfeit'`: il solo controllo su set_scores mancherebbe casi futuri, il solo controllo su status mancherebbe punteggi orfani | si introduce uno stato "in corso" con punteggi parziali |
| 14 | (W1.1) Ambito dell'annullamento della propagazione | la finalina 3º/4º è inclusa: `clearScore` su una semifinale toglie il vincitore dalla finale **e** il perdente dalla finalina | la finalina esiste (repo.ts:1158-1161) e `propagateKnockout` ci scrive il perdente: disfarne solo metà lascerebbe il tabellone incoerente | il tabellone smette di generare la finalina |
| 15 | (W1.1) Colonne toccate nel dipendente | solo se il valore presente è una delle due squadre della partita annullata; nessuna cascata sui turni oltre il primo dipendente | una colonna con una squadra estranea non è stata scritta da noi; la cascata è esclusa dalla decisione 12 (i dipendenti con punteggi sono rifiutati, non svuotati) | si volesse un "annulla a cascata" esplicito lato UI |
| 16 | (W2.1) Soglia di cifre per riconoscere un numero nel testo libero | 9 cifre minime, contro le 8 di `validatePhone` | nel testo libero 8 cifre sono una data ("10.08.2026"): `validatePhone` gira su un campo dedicato dove l'intento è esplicito, il parser gira su prosa. I fissi italiani più corti (070 123456) hanno comunque 9 cifre | compaiono numeri brevi legittimi (numerazioni speciali) nei contatti |
| 17 | (W2.1) Candidato che `validatePhone` rifiuta | resta testo puro, nessun tentativo di spezzarlo in sotto-numeri | spezzare una sequenza ambigua produce link sbagliati, cioè peggio del testo non linkato | si vedono contatti reali con due numeri separati solo da spazi |
| 18 | (W2.1) Normalizzazione E.164 | senza prefisso si assume `+39`; `00` iniziale vale come `+`; con `+` il prefisso resta quello scritto | il torneo è locale, i contatti sono italiani salvo eccezioni scritte per esteso | il torneo apre a iscritti esteri con numeri scritti senza prefisso |
| 19 | (W2.2) Come si sa che un refresh è "in volo" | `useTransition`: `router.refresh()` non ritorna una promise, quindi l'unico segnale è `isPending`, copiato in un ref da un effect | il flag non viene mai alzato a mano: un refresh che finisce all'istante lascerebbe il ref bloccato su true e ucciderebbe l'auto-refresh per sempre | `router.refresh()` diventa awaitable |
| 20 | (W2.3) Dove sta lo scoping della pagina squadra | nella query: `WHERE id = ? AND tournament_id = ? AND status = 'active'`, con l'id del torneo da `getActiveTournament()`; nessun controllo nel chiamante | un filtro applicato dopo la SELECT si dimentica: qui la riga non viene proprio letta se non è in ambito | si introduce una pagina per le edizioni passate (W6), che avrà una funzione sua |
| 21 | (W2.3) Come si evita di esporre i campi sensibili | le colonne pubbliche sono elencate nella SELECT dei giocatori (niente `SELECT *`) e il payload è rimappato a `firstName/lastName/gender` | doppia barriera: anche aggiungendo domani una colonna sensibile a `players`, non finisce nella vista | il payload cresce fino a giustificare un tipo condiviso con le altre viste |
| 22 | (W2.3) Link alle pagine squadra | oltre alla lista in home (visibile solo in fase iscrizioni) anche i nomi in classifica, via prop `linkTeams` di `StandingsTable`; admin invariato | senza questo la pagina è irraggiungibile proprio nei giorni di gara (vedi Surprises W2) | si aggiungono QR/short-link (follow-up W9.2b) |
| 23 | (W2.3) Id non canonici nell'URL | `/^\d+$/` sul segmento: `1e1` o ` 10` danno 404, non la squadra 10 | lo scoping regge comunque, ma un record non deve avere infiniti URL | si introducono slug al posto degli id |
| 24 | (W3.1) `teamsByMatch` è un parametro obbligatorio, non opzionale | quinto argomento richiesto di `buildSchedule`, i test che non riguardano il riposo passano `noTeams` esplicito | una membership dimenticata disattiverebbe il riposo in silenzio; da obbligatoria il typecheck la reclama, e il prossimo chiamante (W5 riempi-buchi) non può ometterla per distrazione | si aggiungono chiamanti dove la membership non è davvero conoscibile |
| 25 | (W3.1) Formula del lookahead | fabbisogno esatto = `ceil(coda_blocco_corrente/campi)` + somma di `ceil(partite/campi)` sui blocchi successivi, invece del `ceil(partite_rimaste/campi)` del piano | i blocchi non condividono mai uno slot, quindi la formula aggregata sottostima il fabbisogno e autorizzerebbe cuscinetti che poi costano partite; quella esatta rende la garanzia "il riposo non perde partite" strutturale invece che rattoppata dalla pass-2 | i blocchi smettono di essere esclusivi sullo slot |
| 26 | (W3.1) Cosa conta come "slot immediatamente precedente" | solo stessa giornata e indice contiguo (`isBackToBack`); il cambio di giornata azzera il vincolo | tra l'ultimo slot di una sera e il primo della mattina dopo il riposo c'è già; senza questo controllo si sprecherebbe un cuscinetto a ogni confine di giornata, allungando il calendario per nulla | si introducono giornate con più fasce orarie separate nello stesso giorno |
| 27 | (W3.1) Esito della doppia passata | se pass-1 lascia partite fuori si tiene la passata con MENO unplaced (a parità vince pass-1, che ha il riposo), invece di adottare pass-2 a scatola chiusa | pass-2 non è mai peggiore per costruzione, ma prendere il minimo rende la rete di sicurezza vera in ogni caso, anche se una modifica futura rompesse quella costruzione | pass-2 diventa la passata di riferimento per altri motivi |
| 28 | (W3.1) Cosa fa il riordino quando il batch resta misto | il batch continua a riempire tutti i campi (le partite in conflitto restano in coda ma non si lascia un campo vuoto); il cuscinetto scatta se dopo il riordino il batch contiene ancora un back-to-back | lasciare campi vuoti per il riposo è l'unico modo di perdere capienza davvero; il cuscinetto è reversibile dal lookahead, un campo vuoto no | si passa a un modello per-campo (follow-up W9.2a) |
| 29 | (W4.1) Nome del cookie | nuovo `gsp_session` (il vecchio `gsp_admin` non descrive più il contenuto, ora c'è anche il segnapunti); `gsp_admin` viene **cancellato** a login e logout | il vecchio valore è sha256 del PIN, cioè un derivato del segreto: lasciarlo nei browser non serve a niente e resta una credenziale morta in giro | si aggiunge un terzo ruolo e il nome del cookie deve dirlo |
| 30 | (W4.1) Tipo di `created_at`/`expires_at` | INTEGER epoch millis, non il `TEXT datetime('now')` delle altre tabelle | sono istanti assoluti confrontati con `Date.now()`: le stringhe naive del resto del DB sono orari di parete di Europe/Rome e confonderli è esattamente il bug del hard requirement 5 | le sessioni devono essere lette da SQL umano più spesso di quanto vengano confrontate |
| 31 | (W4.1) Fail-closed su ADMIN_PIN mancante in produzione | conservato invariato: `roleForPin` propaga l'errore, quindi in quello stato **nemmeno il segnapunti** entra | il PIN admin è un secret obbligatorio del deploy; degradare a "solo segnapunti" trasformerebbe un errore di configurazione in un servizio a metà, silenzioso | SCOREKEEPER_PIN diventa il segreto principale di un deploy senza admin |
| 32 | (W4.1) Finestra di conteggio dei fallimenti | coincide con quella di blocco (15 min) e i tentativi fatti **durante** il blocco non lo prolungano né vengono contati | un blocco che si autoalimenta ad ogni tentativo diventa permanente e chiude fuori l'organizzatore proprio nei giorni di gara, che è il fallimento più costoso qui | si vuole penalizzare il brute force insistente più della disponibilità |
| 33 | (W4.1) IP quando manca `x-forwarded-for` | chiave `"sconosciuto"` condivisa | in locale/dev non c'è proxy: un contatore condiviso è più sicuro che nessun contatore, e in Cloud Run l'header c'è sempre | il servizio finisce dietro un proxy che usa un header diverso |
| 34 | (W4.2) Dove finisce un segnapunti su una pagina di gestione | `requireAdmin` manda un ruolo **autenticato** a `/admin/partite` e un anonimo a `/admin/login` | mandare al login chi è già loggato mostra un form che non serve (e da cui rientrerebbe di nuovo come segnapunti): il redirect all'unica pagina che gli compete è l'unico esito utile | compare una pagina admin in sola lettura sensata per il segnapunti |
| 35 | (W4.2) Firma di `requireScorer` | restituisce il `Role`, non `void` come `requireAdmin` | la pagina partite deve sapere se nascondere i comandi di gestione: senza il valore di ritorno servirebbe una seconda lettura del cookie e una seconda query sulla sessione per ogni render | il ruolo serve a così tante pagine da giustificare un contesto condiviso |
| 36 | (W4.1) `verifyPin` rimosso | sostituito da `roleForPin(pin): Role \| null` (nessun chiamante fuori dai test) | con due PIN un booleano non basta e tenerne due (verifyPin + roleForPin) inviterebbe a controllare quello sbagliato | torna un solo PIN |
| 37 | (W4.2) Come si testano le action | `vitest.config.mts` con alias `@` + `redirect()` mockato che **lancia**, action eseguite davvero su DB temporaneo | è l'unico modo di provare che il segnapunti non crea tornei: un mock di `redirect` che non interrompe farebbe passare il test anche con la guardia bypassata | Next espone un modo supportato di invocare le action fuori dal server |
| 38 | (W5.1) Dove vive l'orologio | `src/lib/clock.ts`, non dentro `scheduler.ts` | lo scheduler è fatto di funzioni pure e non deve avere un "adesso": tenerlo fuori è ciò che rende i suoi test deterministici senza mock | serve l'ora di Roma anche in un contesto senza accesso a moduli condivisi |
| 39 | (W5.1) Forma del clock iniettabile | parametro `at: Date = new Date()` su `nowInRome`/`todayInRome` e su `fillScheduleGaps`, non un'interfaccia `Clock` da iniettare | un default esplicito basta a fissare l'istante nei test e non obbliga nessun chiamante a trasportare una dipendenza; l'interfaccia sarebbe astrazione speculativa per un solo uso | serve congelare il tempo per un intero albero di chiamate |
| 40 | (W5.2) Come si ottiene la finestra utilizzabile | `daysAfter(days, matchMinutes, after)` taglia le giornate PRIMA di `buildSchedule`, invece di filtrare gli slot dentro lo scheduler | lo scheduler resta identico per il full-regenerate, la matematica degli slot resta in un solo posto, e l'inizio si sposta solo di multipli di `match_minutes`, quindi gli orari coincidono con quelli di una generazione da zero | si vogliono finestre di indisponibilità in mezzo a una giornata (buchi, non solo un taglio iniziale) |
| 41 | (W5.2) Cos'è "l'ultimo slot occupato" | massimo lessicale di `scheduled_at` su TUTTE le partite del torneo con un orario (giocate, forfait e solo programmate), non solo su quelle giocate | una partita programmata alle 20:00 e non ancora giocata occupa comunque campo e orario; partendo strettamente dopo il massimo, la collisione campo+orario con l'esistente diventa impossibile per costruzione, senza confrontare i campi uno a uno | si vuole riempire anche i buchi *interni* al calendario (allora serve il modello per-campo del follow-up W9.2a) |
| 42 | (W5.2) Pavimento degli slot nuovi | massimo tra ultimo slot occupato e `nowInRome()`, confronto lessicale su stringhe naive | i due vincoli sono indipendenti (un torneo in ritardo ha l'ultimo slot nel passato, uno appena iniziato ce l'ha nel futuro) e il massimo li soddisfa entrambi con un solo confronto | gli orari salvati smettono di essere ora di parete di Roma |
| 43 | (W5.2) Riposo oltre il bordo della generazione | sesto parametro opzionale `busyBefore` su `buildSchedule` con le squadre dell'ultimo slot occupato; il chiamante lo passa solo se il primo slot libero gli è adiacente | senza, il riempi-buchi rimetteva in campo allo slot successivo squadre appena scese (vedi Surprises W5): sarebbe stata una regressione silenziosa proprio della garanzia introdotta da W3, e solo nel percorso usato a torneo in corso | si passa a un modello per-campo che conosce già l'occupazione reale |
| 44 | (W5.2) Finestra esaurita vs configurazione mancante | nessuno slot residuo → ritorno onesto `{placed: 0, unplaced: n}` senza toccare nulla; giornate o campi assenti → eccezione con messaggio | la finestra esaurita è uno stato legittimo del torneo (l'admin decide se aggiungere una giornata), l'assenza di giornate è una configurazione incompleta da segnalare subito | l'interfaccia distingue i due casi con un messaggio proprio invece che con il conteggio |
| 45 | (W5.2) Nessun ramo di clear in `fillScheduleGaps` | la funzione non ha proprio l'istruzione che cancella orari: solo `UPDATE` sulle partite senza orario | è la differenza sostanziale con `generateSchedule` a torneo in corso, e va garantita dalla forma del codice, non dalla disciplina di chi lo chiama | serve un "risistema da qui in poi" che sposti anche partite già programmate |
| 46 | (W6.1) Dove sta lo scoping dell'archivio | nel listing è la query (`WHERE status = 'finished'`), nel dettaglio è `buildArchiveView`, che controlla lo stato **prima** di costruire la vista e ritorna null | stessa forma della decisione 20: se il torneo non è in ambito non viene proprio letto, e la pagina fa `notFound()` senza logica propria | l'archivio deve mostrare anche edizioni annullate o sospese |
| 47 | (W6.1) Tipo dedicato `ArchiveView` invece di `TournamentView` | la vista d'archivio ricopia da `buildTournamentView` solo nomi, classifiche, partite e podio; `tournament` (contact_info) e i `teams` dei gironi (contact, age_confirmed) restano fuori | riusare `TournamentView` esporrebbe i due unici posti dove vivono i dati non pubblici, e il filtro sarebbe a carico del componente di pagina invece che del tipo (verificato: rimettendoli dentro, il test diventa rosso) | i campi sensibili escono da `tournaments`/`teams` e le righe diventano pubbliche per costruzione |
| 48 | (W6.1) Classifiche d'archivio senza `linkTeams` | le classifiche del dettaglio mostrano i nomi come testo, non come link a `/squadra/[id]` | quella pagina è scoped al torneo attivo (decisione 20): in archivio ogni link sarebbe un 404 garantito | nasce una pagina squadra per le edizioni passate |
| 49 | (W6.1) Podio di un torneo senza tabellone | resta vuoto: `podium()` legge solo partite knockout e non si deduce il vincitore dalle classifiche | con più gironi il primo assoluto è ambiguo; la home si comporta già così, e un podio inventato in archivio resterebbe lì per sempre | i tornei `groups_only` diventano la norma e serve un criterio di classifica generale |
| 50 | (W6.1) Dove sta il link allo storico | nel footer del root layout (`src/app/layout.tsx`), quindi su tutte le pagine pubbliche, non dentro `page.tsx` | la home non ha un footer proprio e il torneo in corso occupa già tutto il corpo: il footer è l'unica zona che resta raggiungibile anche a torneo iniziato | l'archivio merita una voce di navigazione in testata |

## Outcomes & Retrospective
(fill at close)
