export interface RoundRobinMatch<T> {
  round: number; // giornata, 1-based
  a: T;
  b: T;
}

/**
 * Calendario round robin (girone all'italiana) con il metodo del cerchio.
 * Con un numero dispari di squadre, a ogni giornata una squadra riposa.
 */
export function roundRobin<T>(teams: T[]): RoundRobinMatch<T>[] {
  if (teams.length < 2) return [];

  const BYE = Symbol("bye");
  const slots: (T | typeof BYE)[] = [...teams];
  if (slots.length % 2 === 1) slots.push(BYE);

  const n = slots.length;
  const rounds = n - 1;
  const matches: RoundRobinMatch<T>[] = [];

  const rotation = [...slots];
  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      // Alterna casa/trasferta per varietà
      if (r % 2 === 0 && i === 0) {
        matches.push({ round: r, a: b as T, b: a as T });
      } else {
        matches.push({ round: r, a: a as T, b: b as T });
      }
    }
    // Ruota tutti tranne il primo elemento
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop()!);
    rotation.splice(0, n, fixed, ...rest);
  }

  return matches;
}
