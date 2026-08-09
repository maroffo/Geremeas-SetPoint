import { describe, expect, it } from "vitest";
import {
  advanceTarget,
  bracketSlotOrder,
  firstRoundPairings,
  nextPowerOfTwo,
  roundCount,
  roundLabel,
  seedQualifiers,
} from "../bracket";
import type { StandingRow } from "../standings";

function row(teamId: number, points: number, setDiff = 0): StandingRow {
  return {
    teamId,
    played: 3,
    wins: points,
    losses: 3 - points,
    points,
    setsWon: 4 + setDiff,
    setsLost: 4,
    pointsWon: 100,
    pointsLost: 90,
  };
}

describe("seedQualifiers", () => {
  it("prima le prime dei gironi, poi le seconde", () => {
    const groupA = [row(1, 9, 4), row(2, 6), row(3, 3)];
    const groupB = [row(4, 7, 2), row(5, 5), row(6, 0)];
    const seeds = seedQualifiers([groupA, groupB], 2);
    expect(seeds).toEqual([1, 4, 2, 5]);
  });

  it("ignora i ranghi mancanti nei gironi corti", () => {
    const groupA = [row(1, 9), row(2, 6)];
    const groupB = [row(3, 7)];
    const seeds = seedQualifiers([groupA, groupB], 2);
    expect(seeds).toEqual([1, 3, 2]);
  });
});

describe("bracketSlotOrder", () => {
  it("tabellone da 4: 1v4 e 2v3", () => {
    expect(bracketSlotOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("tabellone da 8: 1 e 2 in metà opposte", () => {
    const order = bracketSlotOrder(8);
    expect(order).toHaveLength(8);
    const half1 = order.slice(0, 4);
    const half2 = order.slice(4);
    expect(half1).toContain(1);
    expect(half2).toContain(2);
  });
});

describe("firstRoundPairings", () => {
  it("6 squadre: tabellone da 8 con 2 bye alle teste di serie", () => {
    const pairings = firstRoundPairings([10, 20, 30, 40, 50, 60]);
    expect(pairings).toHaveLength(4);

    const withBye = pairings.filter((p) => p.teamA === null || p.teamB === null);
    expect(withBye).toHaveLength(2);
    // I bye vanno ai seed 1 e 2
    const byeTeams = withBye.map((p) => p.teamA ?? p.teamB);
    expect(byeTeams).toContain(10);
    expect(byeTeams).toContain(20);
  });

  it("4 squadre: semifinali 1ª-4ª e 2ª-3ª senza bye", () => {
    expect(firstRoundPairings([1, 2, 3, 4])).toEqual([
      { pos: 0, teamA: 1, teamB: 4 },
      { pos: 1, teamA: 2, teamB: 3 },
    ]);
  });

  it("5 squadre: solo 4ª e 5ª giocano il quarto di finale", () => {
    expect(firstRoundPairings([1, 2, 3, 4, 5])).toEqual([
      { pos: 0, teamA: 1, teamB: null },
      { pos: 1, teamA: 4, teamB: 5 },
      { pos: 2, teamA: 2, teamB: null },
      { pos: 3, teamA: 3, teamB: null },
    ]);
  });
});

describe("advanceTarget / roundCount / roundLabel", () => {
  it("il vincitore avanza nella posizione giusta", () => {
    expect(advanceTarget(0)).toEqual({ pos: 0, slot: "A" });
    expect(advanceTarget(1)).toEqual({ pos: 0, slot: "B" });
    expect(advanceTarget(2)).toEqual({ pos: 1, slot: "A" });
    expect(advanceTarget(5)).toEqual({ pos: 2, slot: "B" });
  });

  it("etichette dei turni", () => {
    expect(roundCount(8)).toBe(3);
    expect(roundLabel(3, 3)).toBe("Finale");
    expect(roundLabel(2, 3)).toBe("Semifinali");
    expect(roundLabel(1, 3)).toBe("Quarti di finale");
  });
});
