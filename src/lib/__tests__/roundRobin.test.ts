import { describe, expect, it } from "vitest";
import { roundRobin } from "../roundRobin";

describe("roundRobin", () => {
  it("4 squadre: 6 partite in 3 giornate, tutti contro tutti", () => {
    const matches = roundRobin([1, 2, 3, 4]);
    expect(matches).toHaveLength(6);
    expect(new Set(matches.map((m) => m.round))).toEqual(new Set([1, 2, 3]));

    const pairs = new Set(
      matches.map((m) => [m.a, m.b].sort((x, y) => x - y).join("-")),
    );
    expect(pairs.size).toBe(6);
  });

  it("5 squadre (dispari): 10 partite, ognuna gioca 4 volte", () => {
    const matches = roundRobin([1, 2, 3, 4, 5]);
    expect(matches).toHaveLength(10);

    const count = new Map<number, number>();
    for (const m of matches) {
      count.set(m.a, (count.get(m.a) ?? 0) + 1);
      count.set(m.b, (count.get(m.b) ?? 0) + 1);
    }
    for (const id of [1, 2, 3, 4, 5]) expect(count.get(id)).toBe(4);
  });

  it("in ogni giornata una squadra gioca al massimo una volta", () => {
    const matches = roundRobin([1, 2, 3, 4, 5, 6]);
    const byRound = new Map<number, number[]>();
    for (const m of matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m.a, m.b);
      byRound.set(m.round, list);
    }
    for (const teams of byRound.values()) {
      expect(new Set(teams).size).toBe(teams.length);
    }
  });

  it("meno di 2 squadre: nessuna partita", () => {
    expect(roundRobin([1])).toHaveLength(0);
    expect(roundRobin([])).toHaveLength(0);
  });
});
