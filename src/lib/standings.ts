export interface GroupMatchResult {
  teamA: number;
  teamB: number;
  setsA: number;
  setsB: number;
  pointsA: number;
  pointsB: number;
  winner: number;
}

export interface StandingRow {
  teamId: number;
  played: number;
  wins: number;
  losses: number;
  points: number; // punti classifica
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

/**
 * Punti classifica in stile beach volley:
 * vittoria 2-0 (o in gara secca) = 3, vittoria 2-1 = 2,
 * sconfitta 1-2 = 1, sconfitta 0-2 = 0.
 */
function rankingPoints(setsWon: number, setsLost: number, won: boolean): number {
  if (won) return setsLost === 0 ? 3 : 2;
  return setsWon > 0 ? 1 : 0;
}

function ratio(won: number, lost: number): number {
  if (lost === 0) return won === 0 ? 0 : Number.POSITIVE_INFINITY;
  return won / lost;
}

/**
 * Classifica di girone. Criteri in ordine:
 * 1) punti classifica, 2) quoziente set, 3) quoziente punti,
 * 4) scontro diretto (solo tra due squadre a pari merito).
 */
export function computeStandings(
  teamIds: number[],
  results: GroupMatchResult[],
): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  for (const id of teamIds) {
    rows.set(id, {
      teamId: id,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      setsWon: 0,
      setsLost: 0,
      pointsWon: 0,
      pointsLost: 0,
    });
  }

  for (const r of results) {
    const a = rows.get(r.teamA);
    const b = rows.get(r.teamB);
    if (!a || !b) continue;

    a.played++;
    b.played++;
    a.setsWon += r.setsA;
    a.setsLost += r.setsB;
    b.setsWon += r.setsB;
    b.setsLost += r.setsA;
    a.pointsWon += r.pointsA;
    a.pointsLost += r.pointsB;
    b.pointsWon += r.pointsB;
    b.pointsLost += r.pointsA;

    const aWon = r.winner === r.teamA;
    if (aWon) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
    a.points += rankingPoints(r.setsA, r.setsB, aWon);
    b.points += rankingPoints(r.setsB, r.setsA, !aWon);
  }

  const sorted = [...rows.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    const setRatioDiff =
      ratio(y.setsWon, y.setsLost) - ratio(x.setsWon, x.setsLost);
    if (setRatioDiff !== 0) return setRatioDiff > 0 ? 1 : -1;
    const pointRatioDiff =
      ratio(y.pointsWon, y.pointsLost) - ratio(x.pointsWon, x.pointsLost);
    if (pointRatioDiff !== 0) return pointRatioDiff > 0 ? 1 : -1;
    return x.teamId - y.teamId;
  });

  // Scontro diretto: applicato quando esattamente due squadre restano
  // in perfetta parità sui criteri precedenti.
  for (let i = 0; i < sorted.length - 1; i++) {
    const x = sorted[i];
    const y = sorted[i + 1];
    const tied =
      x.points === y.points &&
      ratio(x.setsWon, x.setsLost) === ratio(y.setsWon, y.setsLost) &&
      ratio(x.pointsWon, x.pointsLost) === ratio(y.pointsWon, y.pointsLost);
    if (!tied) continue;

    const direct = results.find(
      (r) =>
        (r.teamA === x.teamId && r.teamB === y.teamId) ||
        (r.teamA === y.teamId && r.teamB === x.teamId),
    );
    if (direct && direct.winner === y.teamId) {
      sorted[i] = y;
      sorted[i + 1] = x;
    }
  }

  return sorted;
}
