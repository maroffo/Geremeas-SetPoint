# ABOUTME: Record redatto di approvazione del night-run (nessun exploit detail, solo l'esito)
# ABOUTME: Il recipe dei findings vive in quality_reports/reviews/ (gitignored, locale)

# Approval — night-run Geremeas SetPoint

- **Branch**: feat/nightrun
- **Commit approvato**: 62c2c9a (fix round 1), su base 3b5d6ed (deploy/gcp-cloud-run)
- **Rounds run**: 1 review round + 1 fix round
- **Converged**: yes

## Counts by severity (consolidato, round 1)

| Severity | Trovati | Fixati | Accettati (tech-debt) |
|----------|---------|--------|-----------------------|
| Critical | 0 | — | — |
| Major | 2 | 2 (M1 lockout XFF, M2 duplicazione view) | 0 |
| Minor | 5 | 3 (m1 open-redirect, m2 timezone, m5 doc) | 2 (m3 firma buildSchedule, m4 persistenza duplicata) |

## CWE ids
- CWE-348 / CWE-290 (M1, lockout keyed su segmento XFF client-controlled) — fixato.
- CWE-601 (m1, open-redirect via backslash) — fixato.

## Final SCORE
SCORE: 94/100 (threshold: 90, gate: pr)

Base 100, meno 2 Minor accettati (m3, m4) × -3 = 94. I 2 Major e 3 Minor sono stati fixati e ri-verificati (167/167 unit + smoke + Playwright verdi sul commit 62c2c9a).

## Residual risks (accettati)
- m3: firma a 6 parametri di `buildSchedule` — refactor estetico su codice hot dello scheduler, rimandato a due giorni dalla gara. In tech-debt.md.
- m4: persistenza duplicata `generateSchedule`/`fillScheduleGaps` — idem. In tech-debt.md.
- Lockout in-memory non persistente ai riavvii (già noto, tech-debt pre-esistente).

## Findings path
`quality_reports/reviews/2026-08-07_nightrun-miglioramenti/001-findings.md` (locale, gitignored: contiene le evidence riproducibili).
