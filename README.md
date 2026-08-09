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
- **Pagina pubblica** consultabile da smartphone senza login; pannello admin
  protetto da PIN.

## Avvio

```bash
npm install
npm run dev        # sviluppo su http://localhost:3000
```

Per la produzione:

```bash
npm run build
npm run start
```

### Configurazione

| Variabile | Default | Descrizione |
|---|---|---|
| `ADMIN_PIN` | `geremeas` | PIN di accesso al pannello `/admin` (cambialo!) |
| `DATABASE_PATH` | `data/geremeas.db` | Percorso del database SQLite |

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
npm test   # unit test della logica di dominio + test d'integrazione del flusso torneo
```

## Stack

Next.js (App Router, server actions) · TypeScript · SQLite (better-sqlite3) ·
Tailwind CSS · Vitest.
