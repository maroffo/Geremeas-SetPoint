# ABOUTME: Istruzioni e vincoli per il deploy su GCP Cloud Run
# ABOUTME: Il servizio DEVE girare con una sola istanza e CPU sempre allocata

# Deploy su Cloud Run

L'app usa SQLite (better-sqlite3) con [Litestream](https://litestream.io):
il DB vive sul filesystem effimero dell'istanza, viene replicato in
continuo su GCS e ripristinato dall'ultima replica a ogni avvio.

## Risorse GCP (progetto `playground-maroffo`)

| Risorsa | Nome |
|---|---|
| Servizio Cloud Run | `geremeas-setpoint` (regione `europe-west1`: i domain mapping non sono disponibili a Milano) |
| Bucket replica DB | `gs://playground-maroffo-geremeas-db` (resta in `europe-west8`: l'accesso cross-region dal Belgio è trascurabile per il volume WAL di quest'app) |
| Service account | `geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com` (solo `storage.objectAdmin` sul bucket + accesso ai secret) |
| Secret PIN admin | `geremeas-admin-pin` in Secret Manager |
| Secret PIN segnapunti | `geremeas-scorekeeper-pin` in Secret Manager (opzionale, vedi sotto) |

## Bootstrap (una tantum)

Come le risorse sono state create; servono solo su un progetto nuovo o per
ricrearne una cancellata (API richieste: `run`, `cloudbuild`,
`artifactregistry`, `secretmanager`, `storage`).

```bash
gcloud storage buckets create gs://playground-maroffo-geremeas-db \
  --project playground-maroffo --location europe-west8 \
  --uniform-bucket-level-access

gcloud iam service-accounts create geremeas-setpoint \
  --project playground-maroffo --display-name "Geremeas SetPoint Cloud Run"

gcloud storage buckets add-iam-policy-binding gs://playground-maroffo-geremeas-db \
  --member serviceAccount:geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com \
  --role roles/storage.objectAdmin

# PIN generato, mai scelto a mano: l'entropia (~4×10⁹ combinazioni) è la prima
# difesa; il lockout per IP (5 tentativi → 15 min) è la seconda
openssl rand -hex 4 | tr -d '\n' | gcloud secrets create geremeas-admin-pin \
  --project playground-maroffo --replication-policy automatic --data-file=-

gcloud secrets add-iam-policy-binding geremeas-admin-pin \
  --project playground-maroffo \
  --member serviceAccount:geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

# PIN del segnapunti: stesso pattern, secret separato. Serve solo se si vuole
# dare a qualcuno il permesso di inserire i punteggi senza dargli l'admin.
openssl rand -hex 4 | tr -d '\n' | gcloud secrets create geremeas-scorekeeper-pin \
  --project playground-maroffo --replication-policy automatic --data-file=-

gcloud secrets add-iam-policy-binding geremeas-scorekeeper-pin \
  --project playground-maroffo \
  --member serviceAccount:geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

# Per leggere un PIN da comunicare (il valore non è recuperabile altrove)
gcloud secrets versions access latest --secret geremeas-scorekeeper-pin \
  --project playground-maroffo
```

## Comando di deploy

```bash
gcloud run deploy geremeas-setpoint \
  --source . \
  --project playground-maroffo \
  --region europe-west1 \
  --service-account geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --max-instances 1 \
  --no-cpu-throttling \
  --memory 512Mi \
  --set-env-vars "LITESTREAM_BUCKET=playground-maroffo-geremeas-db" \
  --set-secrets "ADMIN_PIN=geremeas-admin-pin:latest,SCOREKEEPER_PIN=geremeas-scorekeeper-pin:latest"
```

`SCOREKEEPER_PIN` è **opzionale**: togliendolo dal `--set-secrets` l'app si
comporta esattamente come prima, con il solo ruolo admin, e nessun PIN diverso
da quello di admin viene accettato al login. `ADMIN_PIN` invece resta
obbligatorio: se manca, in produzione il login viene rifiutato per entrambi i
ruoli (un errore di configurazione deve fermare il servizio, non lasciarlo a
metà).

### Dopo questo deploy tutti devono rifare login

L'autenticazione è passata dal cookie derivato dal PIN (`sha256("gsp:"+PIN)`) a
sessioni server-side: il cookie contiene un token casuale e il database tiene
solo il suo sha256. Conseguenze pratiche:

- i cookie emessi dalle revision precedenti non valgono più, quindi al primo
  accesso dopo il rollout admin e segnapunti rivedono il form del PIN. È una
  volta sola, non a ogni deploy successivo.
- il logout ora **revoca davvero**: cancella la riga in `sessions`, quindi un
  cookie copiato altrove smette di funzionare all'istante. Prima il cookie
  restava valido finché non cambiava il PIN.
- le sessioni scadono dopo 30 giorni e quelle scadute vengono ripulite al
  login successivo.
- la tabella `sessions` vive nello stesso SQLite replicato da Litestream: un
  restore riporta indietro anche le sessioni, senza effetti oltre a qualche
  login in più.

Verifica dopo il rollout (non rimandarla a fine finestra): entra in `/admin`
con il PIN admin, poi in una finestra separata con il PIN segnapunti, e
controlla che il segnapunti veda solo la pagina **Partite**.

## Vincoli NON negoziabili

- **`--max-instances 1`**: Litestream supporta un solo replicatore per DB;
  due istanze che scrivono sulla stessa replica GCS la corrompono.
- **`--no-cpu-throttling`**: senza CPU sempre allocata la replica in
  background non gira tra una richiesta e l'altra, e un crash perderebbe
  tutte le scritture dall'ultima sync.
- **PIN solo via Secret Manager**: mai `--set-env-vars ADMIN_PIN=...` né
  `SCOREKEEPER_PIN=...` (finiscono in chiaro nella spec della revision,
  visibile a ogni `run.viewer`). In produzione l'app rifiuta di autenticare se
  `ADMIN_PIN` manca.
- **Rotazione dei PIN**: i secret sono letti all'avvio dell'istanza, quindi
  dopo `gcloud secrets versions add` serve un nuovo deploy (o
  `gcloud run services update geremeas-setpoint --region europe-west1`)
  perché il vecchio PIN smetta di funzionare. Sempre generati
  (`openssl rand -hex 4`), mai scelti a mano. Ruotare un PIN non chiude le
  sessioni già aperte: quelle si chiudono col logout, che le revoca.

## Calendario a torneo in corso

In **Admin → Partite** ci sono due comandi, e nei giorni di gara ne va usato
uno solo.

- **Completa calendario** (riempi-buchi): dà un orario alle sole partite che
  non ce l'hanno, collocandole strettamente dopo l'ultimo slot già occupato
  (partite giocate, a forfait o solo programmate) e comunque non nel passato.
  Non cancella e non sposta nulla di esistente, quindi non può far collidere
  due partite sullo stesso campo e orario. È il comando da usare a torneo
  iniziato, tipicamente dopo aver generato il tabellone o aggiunto una
  giornata.
- **Genera calendario**: rigenerazione completa, riparte dal primo slot della
  prima giornata e riassegna tutte le partite non giocate. Va usato **solo a
  torneo non iniziato**: durante il torneo riscriverebbe gli orari già
  comunicati alle squadre.

Se non restano slot liberi, "Completa calendario" non inventa spazio: lascia le
partite senza orario e lo dice. La risposta è aggiungere una giornata (o un
campo) e rilanciarlo.

Il calendario separa di 5 minuti due incontri consecutivi; dopo l'ultima
partita della giornata non serve una pausa aggiuntiva. La durata configurata
indica solo il gioco: con 40 minuti gli inizi sono 18:00, 18:45, 19:30 e così
via. Non viene più inserito un intero slot vuoto tra due partite della stessa
squadra.

## Monitoraggio

Uptime check Cloud Monitoring attivo su `https://setpoint.wishew.com/`
(HTTPS, GET su `/`, atteso 200, ogni 5 minuti da più regioni) con notification
channel email verso `massimiliano.aroffo@hikmaai.io` e alert policy che scatta
quando il check fallisce. Serve a coprire i giorni di gara: con
`--max-instances 1` un crash dell'istanza non ha un'altra istanza che assorbe
il traffico, quindi la segnalazione via mail è l'unico avviso.

Risorse create (progetto `playground-maroffo`):

| Risorsa | Nome |
|---|---|
| Uptime check | `geremeas-setpoint-home` |
| Notification channel | `Geremeas SetPoint alert (Max)` (email) |
| Alert policy | `Geremeas SetPoint uptime down` |

Verifica che il check esista:

```bash
gcloud monitoring uptime list-configs --project playground-maroffo \
  --format="value(displayName)"
```

## Operatività

```bash
# Log del servizio (ultimi 30 min)
gcloud logging read 'resource.type="cloud_run_revision"
  AND resource.labels.service_name="geremeas-setpoint"' \
  --project playground-maroffo --freshness 30m --format "value(textPayload)"

# La replica è viva? Devono esserci oggetti WAL recenti
gcloud storage ls -l gs://playground-maroffo-geremeas-db/geremeas-setpoint/generations/**

# Restore puntuale (es. dopo una corruzione): da una macchina con litestream
litestream restore -timestamp 2026-08-07T18:00:00Z \
  -o /tmp/geremeas.db gcs://playground-maroffo-geremeas-db/geremeas-setpoint
# poi caricare il DB ripristinato: fermare il servizio, sostituire la replica
# (litestream replicate una tantum dal DB ripristinato) e rideployare
```

## Rischi accettati

- **Finestra di rollout**: durante un deploy la vecchia e la nuova revision
  convivono per qualche secondo con due replicatori attivi; le scritture
  accettate dalla vecchia in quella finestra possono andare perse.
  Mitigazione: deployare quando non si stanno inserendo punteggi.
- **Lockout azzerato dai riavvii**: il login ha un lockout per IP (5 tentativi
  falliti → 15 minuti di blocco, più il delay di 1s e il log su ogni
  fallimento), ma i contatori vivono in memoria: un riavvio dell'istanza o un
  deploy li azzera. Con `--max-instances 1` il conteggio è corretto rispetto
  alla concorrenza, non alla persistenza. Accettato perché il PIN esadecimale a
  8 caratteri (~4×10⁹ combinazioni) rende comunque impraticabile il brute force
  online; un lockout persistente su DB resta tech debt.
- **Un solo contatore quando manca `x-forwarded-for`**: dietro Cloud Run
  l'header c'è sempre, quindi il lockout è per IP; se un giorno il servizio
  finisse dietro un proxy con un header diverso, tutti i tentativi
  ricadrebbero su un contatore condiviso e un attaccante potrebbe bloccare
  l'organizzatore. Da rivedere se cambia il fronte HTTP.
