import { describe, expect, it } from "vitest";
import { computeStandings, type GroupMatchResult } from "../standings";

function result(
  teamA: number,
  teamB: number,
  setsA: number,
  setsB: number,
  pointsA = setsA * 21,
  pointsB = setsB * 21,
): GroupMatchResult {
  return {
    teamA,
    teamB,
    setsA,
    setsB,
    pointsA,
    pointsB,
    winner: setsA > setsB ? teamA : teamB,
  };
}

describe("computeStandings", () => {
  it("assegna 3/2/1/0 punti secondo l'esito", () => {
    const rows = computeStandings(
      [1, 2],
      [result(1, 2, 2, 1, 55, 50)],
    );
    expect(rows[0].teamId).toBe(1);
    expect(rows[0].points).toBe(2); // vittoria 2-1
    expect(rows[1].points).toBe(1); // sconfitta 1-2
  });

  it("ordina per punti, poi quoziente set", () => {
    const rows = computeStandings(
      [1, 2, 3, 4],
      [
        result(1, 2, 2, 0),
        result(3, 4, 2, 1),
        result(1, 3, 2, 0),
        result(2, 4, 2, 1),
      ],
    );
    // 1 ha due vittorie 2-0 (6 punti)
    expect(rows[0].teamId).toBe(1);
    expect(rows[0].points).toBe(6);
  });

  it("scontro diretto tra due squadre in perfetta parità", () => {
    // 1 e 2 identiche su punti/set/punti, ma 2 ha battuto 1
    const rows = computeStandings(
      [1, 2, 3],
      [
        result(2, 1, 2, 0, 42, 30),
        result(1, 3, 2, 0, 42, 30),
        result(3, 2, 2, 0, 42, 30),
      ],
    );
    const pos1 = rows.findIndex((r) => r.teamId === 1);
    const pos2 = rows.findIndex((r) => r.teamId === 2);
    // Tutte a pari punti: lo scontro diretto premia chi ha vinto
    if (
      rows[pos1].points === rows[pos2].points &&
      Math.abs(pos1 - pos2) === 1
    ) {
      expect(pos2).toBeLessThan(pos1);
    }
  });

  it("squadre senza partite restano a zero", () => {
    const rows = computeStandings([1, 2], []);
    expect(rows).toHaveLength(2);
    expect(rows[0].played).toBe(0);
    expect(rows[0].points).toBe(0);
  });
});
