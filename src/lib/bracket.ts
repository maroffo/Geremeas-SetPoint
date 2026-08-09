import type { StandingRow } from "./standings";

export const SMALL_TOURNAMENT_MAX_TEAMS = 5;

/** Formula speciale: girone unico e accesso di tutte le squadre al tabellone. */
export function usesSmallTournamentFormula(teamCount: number): boolean {
  return teamCount >= 2 && teamCount <= SMALL_TOURNAMENT_MAX_TEAMS;
}

/**
 * Numero effettivo di qualificate da un girone unico.
 * Nei tornei piccoli avanzano tutte; da 6 partecipanti vale la configurazione.
 */
export function effectiveAdvancePerGroup(
  teamCount: number,
  configuredAdvance: number,
): number {
  return usesSmallTournamentFormula(teamCount)
    ? teamCount
    : configuredAdvance;
}

/**
 * Ordina le qualificate per il seeding del tabellone a eliminazione:
 * prima tutte le prime classificate (ordinate per rendimento),
 * poi tutte le seconde, e così via.
 */
export function seedQualifiers(
  groupStandings: StandingRow[][],
  advancePerGroup: number,
): number[] {
  const byPerformance = (a: StandingRow, b: StandingRow) => {
    if (b.points !== a.points) return b.points - a.points;
    const setDiffA = a.setsWon - a.setsLost;
    const setDiffB = b.setsWon - b.setsLost;
    if (setDiffB !== setDiffA) return setDiffB - setDiffA;
    const ptsDiffA = a.pointsWon - a.pointsLost;
    const ptsDiffB = b.pointsWon - b.pointsLost;
    if (ptsDiffB !== ptsDiffA) return ptsDiffB - ptsDiffA;
    return a.teamId - b.teamId;
  };

  const seeds: number[] = [];
  for (let rank = 0; rank < advancePerGroup; rank++) {
    const atRank = groupStandings
      .map((g) => g[rank])
      .filter((row): row is StandingRow => row !== undefined)
      .sort(byPerformance);
    seeds.push(...atRank.map((r) => r.teamId));
  }
  return seeds;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Ordine canonico dei seed negli slot di un tabellone da `size` posti
 * (size potenza di 2): la testa di serie 1 incontra la più bassa,
 * 1 e 2 possono incontrarsi solo in finale.
 * Restituisce i numeri di seed (1-based) in ordine di slot.
 */
export function bracketSlotOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const m = order.length * 2 + 1;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, m - s);
    }
    order = next;
  }
  return order;
}

export interface FirstRoundPairing {
  pos: number; // posizione nel primo turno, 0-based
  teamA: number | null; // null = bye
  teamB: number | null;
}

/**
 * Accoppiamenti del primo turno dati i seed (teamId in ordine di seeding).
 * Se le squadre non sono una potenza di 2, le teste di serie più alte
 * ricevono un bye (avversario null).
 */
export function firstRoundPairings(seeds: number[]): FirstRoundPairing[] {
  if (seeds.length < 2)
    throw new Error("Servono almeno 2 squadre per il tabellone");
  const size = nextPowerOfTwo(seeds.length);
  const slots = bracketSlotOrder(size).map((seedNo) =>
    seedNo <= seeds.length ? seeds[seedNo - 1] : null,
  );

  const pairings: FirstRoundPairing[] = [];
  for (let i = 0; i < size / 2; i++) {
    pairings.push({ pos: i, teamA: slots[2 * i], teamB: slots[2 * i + 1] });
  }
  return pairings;
}

/** Numero di turni del tabellone (finale inclusa) per `size` posti. */
export function roundCount(size: number): number {
  return Math.log2(size);
}

/**
 * Dove avanza il vincitore di (round, pos):
 * al turno successivo, posizione floor(pos/2), slot A se pos è pari, B se dispari.
 */
export function advanceTarget(pos: number): { pos: number; slot: "A" | "B" } {
  return { pos: Math.floor(pos / 2), slot: pos % 2 === 0 ? "A" : "B" };
}

export function roundLabel(round: number, totalRounds: number): string {
  const remaining = totalRounds - round;
  if (remaining === 0) return "Finale";
  if (remaining === 1) return "Semifinali";
  if (remaining === 2) return "Quarti di finale";
  if (remaining === 3) return "Ottavi di finale";
  return `${round}º turno`;
}
