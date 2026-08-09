# ABOUTME: Findings consolidati della review sulla feature calendario (giornate, campi, scheduler)
# ABOUTME: Reviewer: architecture con probe empirici (worktree-isolated, 1/1 rientrato)

# Review — calendario giornate/campi (2026-08-07)

Invarianti verificati empiricamente dal reviewer (probe eseguiti): squadre mai
in due partite nello stesso slot (round team-disjoint, finale+3º posto
compresi), round del tabellone sempre dopo i precedenti, aritmetica degli slot
corretta ai bordi giornata.

Esiti: F = fixato.

## Major
| Finding | Esito |
|---|---|
| Orari tipo "25:00" passavano il regex e diventavano "Invalid Date" in pagina | F: validazione di range su ore/minuti e round-trip UTC sulle date (con test) |
| Percorso tabellone dello scheduler senza copertura committata | F: test d'integrazione knockout_only (round in ordine, finale+3º piazzati) |

## Minor
| Finding | Esito |
|---|---|
| Dead code nel loop di buildSchedule | F: rimosso |
| deleteCourt/deleteDay lasciavano riferimenti pendenti nelle partite | F: ripulite le non giocate in transazione (con test) |
| Bound di matchMinutes duplicati e divergenti tra scheduler e repo | F: costanti condivise esportate dallo scheduler |

REVIEW-ARTIFACT: round=1 path=quality_reports/reviews/2026-08-07_calendario-round1.md findings=0/2/3 agents=1/1 converged=yes
