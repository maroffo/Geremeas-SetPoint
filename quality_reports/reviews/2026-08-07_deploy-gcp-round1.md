# ABOUTME: Findings consolidati della review round 1 del deploy GCP (branch deploy/gcp-cloud-run)
# ABOUTME: Reviewer: security, architecture, dx, test (tutti worktree-isolated, 4/4 rientrati)

# Review round 1 — deploy GCP Cloud Run (2026-08-07)

Consolidato dai 4 reviewer (deduplicati: il checksum Litestream era segnalato
da security e architecture). Esiti: F = fixato, A = accettato con motivazione,
D = deferito in `quality_reports/plans/tech-debt.md`.

## Critical
| Finding | Esito |
|---|---|
| `auth.ts`: default PIN "geremeas" fail-open su servizio pubblico | F: in produzione senza `ADMIN_PIN` l'auth lancia (login) o nega (isAdmin), con test |

## Major
| Finding | Esito |
|---|---|
| Nessun rate limit sul login admin pubblico | A (parziale): delay 1s + log sul fallimento, PIN generato a 8 hex (~4×10⁹); lockout per IP in tech-debt |
| Cookie admin = sha256(PIN): credenziale derivata, non revocabile | D: sessioni server-side in tech-debt |
| Tarball Litestream scaricato senza checksum | F: sha256 verificato nel Dockerfile |
| ADMIN_PIN come env var in chiaro nella revision spec | F: Secret Manager + `--set-secrets`, PIN ruotato |
| Service account di default (Editor) come identità runtime | F: SA dedicato `geremeas-setpoint@` con soli bucket+secret |
| max-instances=1 non codificato/documentato | F: nel comando documentato e nei vincoli di deploy/README.md |
| Doppio replicatore nella finestra di rollout | A: documentato come rischio accettato (deploy fuori orario gare) |
| CPU throttling affama la replica in background | F: `--no-cpu-throttling` nel comando di deploy |
| Copertura test assente su isAdmin/loginAdmin (hardening nuovo) | F: 13 test su auth (store cookie mockato, fake timers, round-trip) |
| README radice contraddiceva il fail-closed e `next start` stantio | F: README allineato a standalone + fail-closed, link a deploy/README |
| deploy/README senza bootstrap né runbook | F: sezioni Bootstrap e Operatività aggiunte |
| Rotazione secret non propagata a caldo | F: documentata (serve nuovo deploy) |

## Minor
| Finding | Esito |
|---|---|
| Cookie senza `secure` | F |
| `.dockerignore` copriva solo `.env*.local` | F: `.env*` |
| `isAdmin` con confronto non constant-time | F: timingSafeEqual con guardia sulla lunghezza |
| Path DB duplicato in litestream.yml | F: `${DATABASE_PATH}` |
| Layer ADD non reclamato dal rm (~3 MB) | A: bloat trascurabile, ADD tiene il Dockerfile semplice |
| Stub env "" vs undefined nei test | F: `stubEnv(..., undefined)` |
| ABOUTME litestream.yml incompleto | F |

REVIEW-ARTIFACT: round=1 path=quality_reports/reviews/2026-08-07_deploy-gcp-round1.md findings=1/12/7 agents=4/4 converged=yes
