# ABOUTME: Findings consolidati della review sulla feature vincoli d'età + telefono
# ABOUTME: Reviewer: security e architecture (worktree-isolated, 2/2 rientrati)

# Review — vincoli d'età + contatto telefonico (2026-08-07)

Esiti: F = fixato, D = deferito in tech-debt.

## Major
| Finding | Esito |
|---|---|
| `age_confirmed` split-brain: squadra-level per le iscrizioni squadra, player-level per i singoli, assente per le generate | F: `players.age_confirmed` è la fonte autoritativa (la dichiarazione del capitano si propaga ai giocatori), le squadre generate riepilogano `every(confirmed)`, doc comment sui tipi |

## Minor
| Finding | Esito |
|---|---|
| Telefono senza cap sulla lunghezza totale (formattazione illimitata) | F: max 32 caratteri server-side |
| Vincolo inasprito a iscrizioni aperte: iscritti esistenti non riverificati | D: tech-debt |
| Race check-then-ALTER tra due processi in boot | F: catch del duplicate column |
| validatePhone solo nelle actions, repo accettava qualsiasi stringa | F: `checkContact` in registerTeam/registerSingle |
| DDL duplicate tra SCHEMA e MIGRATIONS | F: costanti condivise |
| `age_confirmed: number` senza semantica documentata | F: doc comment |

Non-findings verificati dai reviewer: enforcement server-side della dichiarazione,
niente ReDoS, niente SQL injection nelle migrazioni, NaN fail-closed sui bounds,
ALTER sicuro sotto WAL/Litestream, submit stantii gestiti dal server.

REVIEW-ARTIFACT: round=1 path=quality_reports/reviews/2026-08-07_eta-telefono-round1.md findings=0/1/6 agents=2/2 converged=yes
