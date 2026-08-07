import { describe, expect, it } from "vitest";
import { generateBalancedTeams, teamSkillTotal } from "../teamGenerator";
import type { DraftPlayer, Gender } from "../types";

let nextId = 1;
function p(gender: Gender, skill: number): DraftPlayer {
  const id = nextId++;
  return { id, firstName: `G${id}`, lastName: `C${id}`, gender, skill };
}

function pool(males: number[], females: number[]): DraftPlayer[] {
  return [...males.map((s) => p("M", s)), ...females.map((s) => p("F", s))];
}

describe("generateBalancedTeams", () => {
  it("crea squadre da 4 con almeno una ragazza ciascuna", () => {
    const players = pool([8, 7, 6, 5, 4, 3], [9, 2]);
    const { teams, reserves } = generateBalancedTeams(players, 4);

    expect(teams).toHaveLength(2);
    expect(reserves).toHaveLength(0);
    for (const team of teams) {
      expect(team).toHaveLength(4);
      expect(team.some((pl) => pl.gender === "F")).toBe(true);
    }
  });

  it("il numero di squadre è limitato dal numero di ragazze", () => {
    const players = pool([9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1], [5]);
    const { teams, reserves } = generateBalancedTeams(players, 4);

    expect(teams).toHaveLength(1);
    expect(teams[0].some((pl) => pl.gender === "F")).toBe(true);
    expect(reserves).toHaveLength(8);
  });

  it("bilancia la bravura tra le squadre", () => {
    const players = pool(
      [10, 9, 8, 7, 6, 5, 4, 3, 2],
      [10, 5, 1],
    );
    const { teams } = generateBalancedTeams(players, 4);

    expect(teams).toHaveLength(3);
    const totals = teams.map(teamSkillTotal);
    const spread = Math.max(...totals) - Math.min(...totals);
    expect(spread).toBeLessThanOrEqual(3);
  });

  it("con 20 iscritti crea 5 squadre di livello simile", () => {
    // Pool realistico: 6 donne e 14 uomini con livelli misti.
    const players = pool([10, 9, 8, 8, 7, 6, 6, 5, 5, 4, 3, 3, 2, 1], [9, 7, 6, 5, 4, 2]);
    const { teams, reserves } = generateBalancedTeams(players, 4);

    expect(teams).toHaveLength(5);
    expect(reserves).toHaveLength(0);
    for (const team of teams) {
      expect(team).toHaveLength(4);
      expect(team.some((pl) => pl.gender === "F")).toBe(true);
    }
    const totals = teams.map(teamSkillTotal);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(3);
  });

  it("resta bilanciato su pool casuali da 20 (guardia di regressione)", () => {
    // LCG deterministico: stessi pool a ogni run, niente flakiness.
    const lcg = (seed: number) => {
      let s = seed;
      return () => (s = (s * 48271) % 2147483647) / 2147483647;
    };
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = lcg(seed);
      const nFem = 5 + Math.floor(rnd() * 4);
      const players = Array.from({ length: 20 }, (_, i) =>
        p(i < nFem ? "F" : "M", 1 + Math.floor(rnd() * 10)),
      );
      const { teams } = generateBalancedTeams(players, 4);
      const totals = teams.map(teamSkillTotal);
      // Empiricamente il greedy sta in spread ≤6 (mediana 2, p95 4 su 500
      // pool): una regressione dell'algoritmo salterebbe ben oltre.
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(6);
    }
  });

  it("mette gli avanzi in riserva", () => {
    const players = pool([5, 5, 5, 5, 5, 5], [5, 5]);
    // 8 giocatori, squadre da 3 → 2 squadre (2 ragazze), 2 riserve
    const { teams, reserves } = generateBalancedTeams(players, 3);
    expect(teams).toHaveLength(2);
    expect(reserves).toHaveLength(2);
  });

  it("errore se non ci sono ragazze", () => {
    const players = pool([5, 5, 5, 5], []);
    expect(() => generateBalancedTeams(players, 4)).toThrow(/ragazza/i);
  });

  it("errore se gli iscritti non bastano per una squadra", () => {
    const players = pool([5, 5], [5]);
    expect(() => generateBalancedTeams(players, 4)).toThrow(/insufficienti/i);
  });
});
