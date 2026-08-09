# Geremeas SetPoint — Analisi funzionale

Sistema di gestione del torneo estivo di beach volley di Geremeas.

## 1. Attori

| Attore | Descrizione |
|---|---|
| **Organizzatore (admin)** | Gestisce iscrizioni, genera squadre e tabellone, inserisce i punteggi |
| **Capitano / giocatore** | Iscrive la propria squadra o se stesso come singolo |
| **Pubblico** | Consulta tabellone, calendario, risultati e classifiche |

## 2. Requisiti funzionali

### 2.1 Iscrizione squadre
- Una squadra ha: nome, lista giocatori, contatto del capitano (telefono/email).
- Ogni giocatore ha: nome, cognome, genere.
- **Vincolo: almeno una ragazza per squadra.** Il sistema blocca l'iscrizione se il vincolo non è rispettato.
- Dimensione squadra configurabile a livello di torneo (es. 3x3 o 4x4), con eventuali riserve.

### 2.2 Iscrizione singoli e composizione automatica squadre
- Un singolo si iscrive con: nome, cognome, genere, contatto e **livello di bravura da 1 a 10** (autovalutazione).
- L'admin lancia la **generazione automatica delle squadre** dai singoli iscritti.
- Algoritmo di bilanciamento:
  1. Si calcola il numero di squadre formabili (vincolato dal numero di ragazze disponibili: max 1 squadra per ragazza se le ragazze sono il fattore limitante).
  2. Le ragazze vengono distribuite per prime, in ordine di bravura, a serpentina.
  3. I restanti giocatori vengono assegnati a serpentina (snake draft) sulle squadre ordinate per somma di bravura crescente, così che la somma dei livelli risulti il più uniforme possibile.
  4. Obiettivo: minimizzare la differenza tra la somma di bravura della squadra più forte e quella più debole.
- Le squadre generate sono **proposte modificabili**: l'admin può fare scambi manuali prima di confermare.
- Gli avanzi (giocatori che non completano una squadra) restano in lista d'attesa come riserve.

### 2.3 Tabellone
- **Fase a gironi**: round robin all'interno di ogni girone.
  - Numero di gironi configurabile (o calcolato dal sistema in base al numero di squadre).
  - Distribuzione delle squadre nei gironi casuale o con teste di serie.
- **Fase a eliminazione diretta**: le prime N di ogni girone avanzano (N configurabile).
  - Nel formato gironi + eliminazione, con meno di 6 squadre si crea un girone unico e avanzano tutte. Con 5 squadre, 4ª e 5ª giocano un quarto di finale; la vincente affronta la 1ª in semifinale, mentre l'altra semifinale è 2ª contro 3ª.
  - Seeding incrociato classico (1ª girone A vs 2ª girone B, ecc.).
  - Bracket con quarti/semifinali/finale ed eventuale finale 3º/4º posto.
- Formati alternativi supportati: solo gironi (campionato) o sola eliminazione diretta, per tornei piccoli o brevi.

### 2.4 Partite e punteggi
- Regole di punteggio configurabili per torneo (default beach volley: **2 set su 3, set a 21 punti, eventuale 3º set a 15, vantaggi di 2**). Variante torneo veloce: set secco a 21.
- Inserimento risultato: punti per set; il sistema valida la coerenza (vincitore, punteggi minimi, scarto di 2).
- Stati partita: da giocare → in corso → conclusa (+ forfait/ritiro con vittoria a tavolino).

### 2.5 Classifiche
- Classifica di girone aggiornata automaticamente a ogni risultato.
- Criteri (in ordine): punti classifica (es. 3 vittoria 2-0, 2 vittoria 2-1, 1 sconfitta 1-2, 0 sconfitta 0-2 — configurabile, in alternativa semplice conteggio vittorie), quoziente set, quoziente punti, scontro diretto.

## 3. Funzionalità aggiuntive proposte ("serve altro?")

- **Calendario partite e campi**: assegnazione di orario e campo a ogni partita, con vista "prossime partite" e pausa fissa di 5 minuti tra incontri consecutivi.
- **Pagina pubblica** consultabile da smartphone senza login: tabellone, risultati live, classifiche.
- **Gestione forfait/ritiri** di squadre a torneo in corso.
- **Lista d'attesa / riserve** per rimpiazzare infortuni o rinunce.
- **Export/stampa** del tabellone e del calendario (per il cartellone in spiaggia).
- **Multi-torneo**: archivio delle edizioni (2026, 2027, …) con albo d'oro.
- **Autenticazione minimale**: un PIN/password per l'admin; iscrizioni aperte al pubblico tramite form. Niente account per i giocatori.

Fuori scope (per ora): pagamenti quote di iscrizione, notifiche push/SMS, arbitraggio digitale punto-a-punto.

## 4. Modello dati (bozza)

```
Tournament (id, nome, anno, dimensione_squadra, formato, regole_punteggio, stato)
Team       (id, tournament_id, nome, origine[iscritta|generata], stato[attiva|ritirata], contatto)
Player     (id, tournament_id, nome, cognome, genere, bravura?, contatto?, team_id?, riserva?)
Group      (id, tournament_id, nome)                 -- girone
GroupTeam  (group_id, team_id)
Match      (id, tournament_id, fase[girone|bracket], group_id?, round?, posizione_bracket?,
            team_a, team_b, campo?, orario?, stato, vincitore?)
SetScore   (match_id, numero_set, punti_a, punti_b)
```

Vincoli chiave: `almeno 1 giocatore con genere=F per Team attiva`; `bravura` obbligatoria solo per iscritti come singoli.

## 5. Flusso d'uso tipico

1. L'admin crea il torneo (dimensione squadre, formato, regole set).
2. Fase iscrizioni: squadre complete + singoli (con bravura) tramite form pubblico.
3. Chiusura iscrizioni → generazione automatica squadre dai singoli → eventuali ritocchi manuali.
4. Generazione gironi e calendario.
5. Durante il torneo: l'admin inserisce i punteggi; classifiche e bracket si aggiornano da soli.
6. Fine gironi → generazione bracket a eliminazione → finali → vincitore e albo d'oro.

## 6. Punti aperti (da decidere)

1. **Stack tecnologico** e modalità di deploy.
2. **Dimensione squadre** di default (3x3? 4x4?).
3. **Chi inserisce le iscrizioni**: form pubblico self-service o solo l'admin raccoglie i nomi?
