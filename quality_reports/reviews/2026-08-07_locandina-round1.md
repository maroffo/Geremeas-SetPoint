# ABOUTME: Findings consolidati della review su locandina, contatti torneo, edit contatti, generi
# ABOUTME: Reviewer: security (worktree-isolated, 1/1 rientrato)

# Review — locandina + contatti + generi (2026-08-07)

Esiti: F = fixato, A = accettato.

## Major
| Finding | Esito |
|---|---|
| Cap 2MB irraggiungibile: Next taglia i body delle server action a 1MB di default | F: `serverActions.bodySizeLimit: "3mb"` in next.config.ts, il cap applicativo resta 2MB |

## Minor
| Finding | Esito |
|---|---|
| /locandina senza X-Content-Type-Options | F: nosniff |
| Open redirect via campo hidden `back` in done() | F: accettati solo path interni (no `//`), fallback /admin, vale per tutti i call site |
| Lettura SQLite sincrona del BLOB a ogni richiesta pubblica | F: cache in-process (corretta con singola istanza) |

Non-findings verificati: allowlist mime server-side (jpeg/png/webp, niente SVG),
file.size affidabile, contact_info renderizzato solo come testo React (niente
dangerouslySetInnerHTML), azioni contatti dietro requireAdmin con validazione
telefonica, SQL parametrizzato.

REVIEW-ARTIFACT: round=1 path=quality_reports/reviews/2026-08-07_locandina-round1.md findings=0/1/3 agents=1/1 converged=yes
