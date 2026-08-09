# Geremeas SetPoint 🏐

Sistema di gestione del torneo estivo di beach volley di Geremeas: iscrizioni,
composizione automatica delle squadre, gironi, tabellone a eliminazione diretta
e tracciamento dei punteggi.

L'analisi funzionale completa è in [ANALISI.md](ANALISI.md).

## Funzionalità

- **Iscrizione squadre** dal sito, con vincolo di almeno una ragazza per squadra
  (più fino a 2 riserve); l'organizzatore conferma le squadre.
- **Iscrizione singoli** con autovalutazione della bravura (1–10); il sistema
  compone squadre bilanciate garantendo una ragazza per squadra.
- **Gironi** generati automaticamente (sorteggio a serpentina + calendario
  round robin) e **classifiche** con punti 3/2/1/0, quoziente set, quoziente
  punti e scontro diretto.
- **Tabellone a eliminazione diretta** con seeding incrociato dai gironi, bye
  per le teste di serie, finale 3º/4º posto e podio. Nel formato misto, con
  meno di 6 squadre si gioca un girone unico e avanzano tutte; con 5 squadre
  la 4ª e la 5ª disputano il quarto che determina l'avversaria della 1ª in
  semifinale.
- **Punteggi** validati con le regole del beach volley (2 set su 3, set a 21,
  terzo set a 15, vantaggi con 2 punti di scarto) — regole configurabili per
  torneo. Gestione forfait con vittoria a tavolino.
- **Calendario**: campo e orario per ogni partita, sezione "prossime partite".
  Il calendario lascia a ogni squadra almeno uno slot di riposo tra due sue
  partite quando la capienza lo consente. A torneo iniziato **Completa
  calendario** dà un orario solo alle partite che non ce l'hanno, in coda a
  quelle già programmate, senza toccare nulla di esistente; **Genera
  calendario** rifà tutto da capo e va usato prima dell'inizio.
- **Pagina squadra** pubblica (`/squadra/<id>`): partite della squadra con
  orario, campo e risultato, più la classifica del suo girone. Si raggiunge
  dai nomi in classifica e dalla lista iscritti. Mostra solo nomi e genere dei
  giocatori: contatti, autovalutazione e dichiarazione d'età non escono mai
  dalle pagine pubbliche. Risponde solo per le squadre confermate del torneo in
  corso, 404 in ogni altro caso.
- **Storico edizioni** (`/storico`, link nel footer): elenco dei tornei
  conclusi con il podio, e per ognuno la pagina di dettaglio in sola lettura
  con classifiche, tabellone e risultati.
- **Auto-refresh**: le pagine pubbliche si ricaricano da sole ogni 60 secondi
  mentre la scheda è in primo piano, così i risultati si aggiornano senza che
  nessuno tocchi lo schermo.
- **Contatti cliccabili**: i numeri di telefono scritti nelle informazioni del
  torneo diventano link WhatsApp e link di chiamata; il resto del testo resta
  com'è.
- **Pagina pubblica** consultabile da smartphone senza login; pannello admin
  protetto da PIN.
- **Ruolo segnapunti**: un secondo PIN, separato da quello di admin, che dà
  accesso alla sola pagina **Partite** e ai soli comandi di punteggio (salva
  risultato, forfait, annulla risultato). Serve per chi sta a bordo campo: non
  può creare tornei, confermare iscrizioni, generare gironi, tabellone o
  calendario. Il PIN è opzionale: se non è configurato il ruolo semplicemente
  non esiste.

## Avvio

```bash
npm install
npm run dev        # sviluppo su http://localhost:3000
```

Per la produzione l'app è pensata per il deploy in container su Cloud Run
(vedi [deploy/README.md](deploy/README.md)). Per provare in locale la build
standalone (`next start` non funziona con `output: "standalone"`):

```bash
npm run build
cp -r .next/static .next/standalone/.next/static
node .next/standalone/server.js
```

### Configurazione

| Variabile | Default | Descrizione |
|---|---|---|
| `ADMIN_PIN` | `geremeas` (solo sviluppo) | PIN di accesso al pannello `/admin`. In produzione (`NODE_ENV=production`) è obbligatorio: senza, il login viene rifiutato per entrambi i ruoli |
| `SCOREKEEPER_PIN` | assente | PIN del ruolo segnapunti (solo pagina Partite, solo comandi di punteggio). Se non impostato il ruolo è disattivo e l'app si comporta come con il solo admin |
| `DATABASE_PATH` | `data/geremeas.db` | Percorso del database SQLite |

Il login è lo stesso per entrambi i ruoli: è il PIN inserito a decidere se si
entra come admin o come segnapunti. La sessione vive nel database (cookie con
token casuale, 30 giorni di durata) e il logout la revoca davvero.

Per il deploy su GCP Cloud Run vedi [deploy/README.md](deploy/README.md).

### Dati di prova

```bash
npm run seed   # ricrea data/geremeas.db con torneo demo, squadre, gironi e risultati
```

## Uso tipico

1. Entra in `/admin` (PIN) e crea il torneo: dimensione squadre (default 4x4),
   formato (gironi + eliminazione, solo gironi, o sola eliminazione), regole set.
2. Squadre e singoli si iscrivono dal sito; conferma le squadre in
   **Admin → Iscrizioni**.
3. In **Admin → Squadre** genera le squadre dai singoli (rigenerabile, con
   scambi manuali finché non crei i gironi).
4. In **Admin → Gironi** scegli il numero di gironi: nel formato misto, con
   meno di 6 squadre il sistema imposta automaticamente un girone unico
   all'italiana.
5. Inserisci i risultati in **Admin → Partite**; classifiche e "prossime
   partite" si aggiornano da sole.
6. A gironi conclusi genera il tabellone in **Admin → Tabellone**; i vincitori
   avanzano automaticamente fino alla finale, poi chiudi il torneo per
   mostrare il podio.

## Test

```bash
make check          # typecheck + npm audit + unit e integrazione
make test-e2e       # smoke sull'app costruita davvero (build standalone + probe HTTP)
make test-e2e-full  # flusso completo nel browser con Playwright: iscrizione → podio
```

`npm test` da solo esegue unit test della logica di dominio e test
d'integrazione del flusso torneo. In un worktree appena creato il typecheck
fallisce su `LayoutProps` finché non gira `npx next typegen` (o una build): è un
tipo generato da Next, non codice rotto.

## Stack

Next.js (App Router, server actions) · TypeScript · SQLite (better-sqlite3) ·
Tailwind CSS · Vitest.
