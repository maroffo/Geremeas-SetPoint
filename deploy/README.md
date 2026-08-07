# ABOUTME: Istruzioni e vincoli per il deploy su GCP Cloud Run
# ABOUTME: Il servizio DEVE girare con una sola istanza e CPU sempre allocata

# Deploy su Cloud Run

L'app usa SQLite (better-sqlite3) con [Litestream](https://litestream.io):
il DB vive sul filesystem effimero dell'istanza, viene replicato in
continuo su GCS e ripristinato dall'ultima replica a ogni avvio.

## Risorse GCP (progetto `playground-maroffo`)

| Risorsa | Nome |
|---|---|
| Servizio Cloud Run | `geremeas-setpoint` (regione `europe-west8`) |
| Bucket replica DB | `gs://playground-maroffo-geremeas-db` |
| Service account | `geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com` (solo `storage.objectAdmin` sul bucket + accesso al secret) |
| Secret PIN admin | `geremeas-admin-pin` in Secret Manager |

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

# PIN generato, mai scelto a mano: l'entropia (~4×10⁹ combinazioni) è ciò
# che rende accettabile l'assenza di lockout sul login
openssl rand -hex 4 | tr -d '\n' | gcloud secrets create geremeas-admin-pin \
  --project playground-maroffo --replication-policy automatic --data-file=-

gcloud secrets add-iam-policy-binding geremeas-admin-pin \
  --project playground-maroffo \
  --member serviceAccount:geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor
```

## Comando di deploy

```bash
gcloud run deploy geremeas-setpoint \
  --source . \
  --project playground-maroffo \
  --region europe-west8 \
  --service-account geremeas-setpoint@playground-maroffo.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --max-instances 1 \
  --no-cpu-throttling \
  --memory 512Mi \
  --set-env-vars "LITESTREAM_BUCKET=playground-maroffo-geremeas-db" \
  --set-secrets "ADMIN_PIN=geremeas-admin-pin:latest"
```

## Vincoli NON negoziabili

- **`--max-instances 1`**: Litestream supporta un solo replicatore per DB;
  due istanze che scrivono sulla stessa replica GCS la corrompono.
- **`--no-cpu-throttling`**: senza CPU sempre allocata la replica in
  background non gira tra una richiesta e l'altra, e un crash perderebbe
  tutte le scritture dall'ultima sync.
- **`ADMIN_PIN` solo via Secret Manager**: mai `--set-env-vars ADMIN_PIN=...`
  (finisce in chiaro nella spec della revision, visibile a ogni `run.viewer`).
  In produzione l'app rifiuta di autenticare se `ADMIN_PIN` manca.
- **Rotazione del PIN**: il secret è letto all'avvio dell'istanza, quindi
  dopo `gcloud secrets versions add` serve un nuovo deploy (o
  `gcloud run services update geremeas-setpoint --region europe-west8`)
  perché il vecchio PIN smetta di funzionare. Sempre generato
  (`openssl rand -hex 4`), mai scelto a mano.

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
- **Niente lockout sui login falliti**: c'è solo delay di 1s + log; il PIN
  esadecimale a 8 caratteri (~4×10⁹ combinazioni) rende comunque il brute
  force online impraticabile. Un eventuale lockout per IP è tech debt.
