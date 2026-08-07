import type { ScoreRules, SetInput } from "./types";

export interface ValidatedScore {
  setsA: number;
  setsB: number;
  pointsA: number;
  pointsB: number;
  winner: "A" | "B";
}

/**
 * Valida il punteggio di una partita rispetto alle regole del torneo.
 * Regole beach volley: set vinto ai `pointsPerSet` punti (set decisivo a
 * `pointsLastSet`), sempre con almeno 2 punti di scarto; oltre il punteggio
 * base si va ai vantaggi e si chiude con esattamente 2 punti di scarto.
 */
export function validateMatchScore(
  sets: SetInput[],
  rules: ScoreRules,
): { ok: true; score: ValidatedScore } | { ok: false; error: string } {
  const setsToWin = Math.ceil(rules.bestOf / 2);

  if (sets.length === 0) return { ok: false, error: "Inserisci almeno un set" };
  if (sets.length > rules.bestOf)
    return { ok: false, error: `Al massimo ${rules.bestOf} set` };

  let setsA = 0;
  let setsB = 0;
  let pointsA = 0;
  let pointsB = 0;

  for (let i = 0; i < sets.length; i++) {
    const { a, b } = sets[i];
    const setNo = i + 1;

    if (setsA === setsToWin || setsB === setsToWin)
      return { ok: false, error: "La partita era già decisa: rimuovi i set in eccesso" };

    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0)
      return { ok: false, error: `Set ${setNo}: punteggio non valido` };
    if (a === b) return { ok: false, error: `Set ${setNo}: un set non può finire in parità` };

    const isDecider = rules.bestOf > 1 && setNo === rules.bestOf;
    const target = isDecider ? rules.pointsLastSet : rules.pointsPerSet;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);

    if (hi < target)
      return {
        ok: false,
        error: `Set ${setNo}: il set si vince ad almeno ${target} punti`,
      };
    if (hi === target && hi - lo < 2)
      return {
        ok: false,
        error: `Set ${setNo}: servono almeno 2 punti di scarto`,
      };
    if (hi > target && hi - lo !== 2)
      return {
        ok: false,
        error: `Set ${setNo}: ai vantaggi si chiude con esattamente 2 punti di scarto`,
      };

    if (a > b) setsA++;
    else setsB++;
    pointsA += a;
    pointsB += b;
  }

  if (setsA < setsToWin && setsB < setsToWin)
    return {
      ok: false,
      error: `Partita incompleta: una squadra deve vincere ${setsToWin} set`,
    };

  return {
    ok: true,
    score: {
      setsA,
      setsB,
      pointsA,
      pointsB,
      winner: setsA > setsB ? "A" : "B",
    },
  };
}
