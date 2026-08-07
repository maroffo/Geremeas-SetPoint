import { describe, expect, it } from "vitest";
import { validateMatchScore } from "../score";
import type { ScoreRules } from "../types";

const bo3: ScoreRules = { bestOf: 3, pointsPerSet: 21, pointsLastSet: 15 };
const bo1: ScoreRules = { bestOf: 1, pointsPerSet: 21, pointsLastSet: 21 };

describe("validateMatchScore", () => {
  it("accetta una vittoria 2-0", () => {
    const r = validateMatchScore(
      [
        { a: 21, b: 15 },
        { a: 21, b: 19 },
      ],
      bo3,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.score.winner).toBe("A");
      expect(r.score.setsA).toBe(2);
      expect(r.score.pointsA).toBe(42);
      expect(r.score.pointsB).toBe(34);
    }
  });

  it("accetta una vittoria 2-1 con terzo set a 15", () => {
    const r = validateMatchScore(
      [
        { a: 21, b: 18 },
        { a: 17, b: 21 },
        { a: 13, b: 15 },
      ],
      bo3,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.score.winner).toBe("B");
  });

  it("accetta i vantaggi (23-21)", () => {
    const r = validateMatchScore(
      [
        { a: 23, b: 21 },
        { a: 21, b: 10 },
      ],
      bo3,
    );
    expect(r.ok).toBe(true);
  });

  it("rifiuta un set vinto sotto il punteggio minimo", () => {
    const r = validateMatchScore(
      [
        { a: 15, b: 10 },
        { a: 21, b: 10 },
      ],
      bo3,
    );
    expect(r.ok).toBe(false);
  });

  it("rifiuta scarto insufficiente (21-20)", () => {
    const r = validateMatchScore(
      [
        { a: 21, b: 20 },
        { a: 21, b: 10 },
      ],
      bo3,
    );
    expect(r.ok).toBe(false);
  });

  it("rifiuta vantaggi chiusi con scarto sbagliato (25-21)", () => {
    const r = validateMatchScore(
      [
        { a: 25, b: 21 },
        { a: 21, b: 10 },
      ],
      bo3,
    );
    expect(r.ok).toBe(false);
  });

  it("rifiuta il pareggio in un set", () => {
    const r = validateMatchScore([{ a: 21, b: 21 }], bo1);
    expect(r.ok).toBe(false);
  });

  it("rifiuta una partita incompleta", () => {
    const r = validateMatchScore([{ a: 21, b: 15 }], bo3);
    expect(r.ok).toBe(false);
  });

  it("rifiuta set dopo che la partita è decisa", () => {
    const r = validateMatchScore(
      [
        { a: 21, b: 15 },
        { a: 21, b: 15 },
        { a: 15, b: 10 },
      ],
      bo3,
    );
    expect(r.ok).toBe(false);
  });

  it("gara secca: un set a 21 basta", () => {
    const r = validateMatchScore([{ a: 21, b: 19 }], bo1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.score.winner).toBe("A");
  });
});
