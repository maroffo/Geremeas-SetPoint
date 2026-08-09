# ABOUTME: Un newline finale in un secret di Secret Manager fa fallire il confronto sha256 del PIN
# ABOUTME: Categoria infrastructure: creazione secret, deploy Cloud Run

# Problem

Login con un PIN preso da Secret Manager fallisce ("PIN errato") anche se il PIN è giusto, mentre un altro PIN creato prima funziona. L'app confronta `sha256(input)` con `sha256(secret)`.

# Solution

Il secret conteneva un newline finale. Verifica:

```bash
gcloud secrets versions access latest --secret <nome> --project <proj> | xxd | tail -1
# ...0a  → c'è un \n finale (es. 9 byte invece di 8)
```

Ricrea il valore senza newline e aggiorna il servizio:

```bash
printf '<valore>' > /tmp/pin            # printf, NON echo, NON `> file` da openssl
gcloud secrets versions add <nome> --project <proj> --data-file=/tmp/pin
gcloud run services update <servizio> --region <reg> --update-secrets "<ENV>=<nome>:latest"
```

In fase di bootstrap, genera sempre stripando il newline:

```bash
openssl rand -hex 4 | tr -d '\n' | gcloud secrets create <nome> --data-file=-
```

# Why It Works

`openssl rand -hex` (e la redirezione `>`) lasciano un `\n` finale che finisce dentro il valore del secret. `sha256("abc") != sha256("abc\n")`, quindi ogni confronto crittografico fallisce. Il `tr -d '\n'` (o `printf` senza newline) rimuove il byte invisibile. Cloud Run legge i secret all'avvio dell'istanza: dopo una nuova versione serve un update/deploy perché venga riletta.
