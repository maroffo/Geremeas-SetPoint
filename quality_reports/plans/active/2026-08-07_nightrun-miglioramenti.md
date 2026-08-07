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
- [ ] W2.2 AutoRefresh client component (decisione 7): mount in home e pagina squadra; nessun refresh se tab nascosto o refresh precedente in volo.
- [ ] W2.3 `/squadra/[id]` (decisione 1): repo `getTeamPublicView(teamId)` che applica lo scoping in query; pagina con partite della squadra + classifica girone; link dalle liste squadre in home. Test repo: 404-path (torneo vecchio, withdrawn, pending), niente campi sensibili nel payload.
- [ ] W2.4 Deploy A + verifica prod (home, una pagina squadra, link wa.me).

### W3 - riposo scheduler (deploy B con W5)
- [ ] W3.1 buildSchedule: firma con `teamsByMatch: Map<number, number[]>`; riordino interno al blocco (le partite di squadre che hanno giocato nello slot precedente vanno in fondo alla coda del blocco); se il back-to-back persiste e restano slot sufficienti (lookahead `remainingSlots > ceil(remainingMatches/courts)`), inserisci UNO slot buffer; doppia passata come rete di sicurezza (se pass-1 produce unplaced, usa pass-2 senza riposo). Test: capienza larga → zero back-to-back; capienza stretta → stesso placed count di oggi; proprietà su pool casuali.
- [ ] W3.2 generateSchedule passa la membership (team_a/team_b delle pending).

### W4 - sessioni + ruoli (deploy C subito verificato)
- [ ] W4.1 Tabella `sessions` (id, token_hash UNIQUE, role, created_at, expires_at) in db.ts (CREATE IF NOT EXISTS, niente ALTER); auth.ts riscritto: createSession/validateSession/revokeSession, cookie col token raw, DB con sha256; loginAdmin accetta ADMIN_PIN→admin, SCOREKEEPER_PIN→scorekeeper (secret opzionale: assente = ruolo disattivo); lockout in-memory (Map ip→{fails,until}) 5 tentativi → 15 min; cleanup lazy delle scadute al login. Test: login/logout/revoca, ruolo, lockout, scadenza.
- [ ] W4.2 requireAdmin() invariato per le 20 action di gestione; nuovo requireScorer() (admin O scorekeeper) per saveScore/forfeit/clearScore E per la view partite; layout admin role-aware (nav ridotta per scorekeeper: solo Partite); admin/partite nasconde a scorekeeper i form scheduleMatch e il bottone genera. Test: scorekeeper può salvare un punteggio, NON può creare tornei (assert error).
- [ ] W4.3 Secret GCP `geremeas-scorekeeper-pin` (openssl rand -hex 4) + `--set-secrets SCOREKEEPER_PIN=...` nel comando deploy documentato.
- [ ] W4.4 Deploy C, re-login verificato in prod con entrambi i PIN, PIN segnapunti riportato a Max.

### W5 - calendario: riempi-buchi + timezone
- [ ] W5.1 Helper `nowInRome()` + `todayInRome()` (decisione 6) in scheduler.ts o lib dedicata; unit test DST (2026-03-29, 2026-10-25) con clock iniettabile.
- [ ] W5.2 repo.fillScheduleGaps(tournamentId): pending con scheduled_at NULL, blocchi come oggi, MA slot disponibili = quelli strettamente successivi all'ultimo slot occupato (max su scheduled_at di partite played+scheduled del torneo) e comunque > nowInRome(); nessun clear. Azione admin "Completa calendario" accanto a "Genera": Genera resta full con testo "da usare a torneo non iniziato". Test: partite giocate intatte, nuove partite solo in coda, niente collisioni campo+orario, niente orari passati.
- [ ] W5.3 Deploy B (W3+W5 insieme) + verifica prod.

### W6 - archivio edizioni (deploy D con W6 finale)
- [ ] W6.1 `/storico`: tornei status=finished (anno, nome, podio da buildTournamentView); `/storico/[id]`: vista read-only (classifiche, tabellone, risultati), 404 se non finished; link nel footer/home. Niente contatti né dati player sensibili. Test repo per lo scoping.
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
- [ ] W2 quick win + deploy A
- [ ] W3 riposo scheduler
- [ ] W4 sessioni+ruoli + deploy C
- [ ] W5 riempi-buchi/timezone + deploy B
- [ ] W6 archivio + deploy D
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

## Outcomes & Retrospective
(fill at close)
