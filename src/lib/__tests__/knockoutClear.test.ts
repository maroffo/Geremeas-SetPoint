// ABOUTME: Test dell'annullamento di un risultato nel tabellone a eliminazione diretta.
// ABOUTME: Verifica che clearScore disfi la propagazione (finale e finalina) e rifiuti se il turno successivo è già giocato.
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-koclear-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

let counter = 0;

function fourPlayers() {
  return [
    { firstName: "Anna", lastName: "Rossi", gender: "F" as const },
    { firstName: "Bruno", lastName: "Bianchi", gender: "M" as const },
    { firstName: "Carlo", lastName: "Verdi", gender: "M" as const },
    { firstName: "Dario", lastName: "Neri", gender: "M" as const },
  ];
}

/** Torneo a sola eliminazione con 4 squadre: 2 semifinali, finale, finalina. */
function setupKnockout() {
  const tournamentId = repo.createTournament({
    name: `Tabellone ${++counter}`,
    year: 2026,
    teamSize: 4,
    format: "knockout_only",
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
  });
  for (let i = 1; i <= 4; i++) {
    const teamId = repo.registerTeam(
      tournamentId,
      `Squadra ${counter}-${i}`,
      `333000000${i}`,
      fourPlayers(),
    );
    repo.setTeamStatus(teamId, "active");
  }
  repo.generateKnockout(tournamentId);

  const knockout = repo
    .listMatches(tournamentId)
    .filter((m) => m.phase === "knockout");
  const semis = knockout
    .filter((m) => m.round === 1)
    .sort((a, b) => a.bracket_pos! - b.bracket_pos!);
  const final = knockout.find((m) => m.round === 2 && !m.is_third_place)!;
  const third = knockout.find((m) => m.is_third_place)!;
  return { tournamentId, semis, final, third };
}

const twoZero = [
  { a: 21, b: 10 },
  { a: 21, b: 12 },
];

describe("clearScore su partita del tabellone", () => {
  it("rimuove il vincitore propagato dalla finale e il perdente dalla finalina", () => {
    const { semis, final, third } = setupKnockout();
    for (const s of semis) repo.saveScore(s.id, twoZero);

    // La semifinale bracket_pos 0 propaga in slot A di finale e finalina
    const semi = semis[0];
    const winner = repo.getMatch(semi.id)!.winner;
    const loser = semi.team_b;
    expect(repo.getMatch(final.id)!.team_a).toBe(winner);
    expect(repo.getMatch(third.id)!.team_a).toBe(loser);

    repo.clearScore(semi.id);

    expect(repo.getMatch(semi.id)!.status).toBe("scheduled");
    expect(repo.getMatch(semi.id)!.winner).toBeNull();
    expect(repo.matchSets(semi.id)).toHaveLength(0);

    const finalAfter = repo.getMatch(final.id)!;
    expect(finalAfter.team_a).toBeNull();
    // L'altra semifinale resta propagata
    expect(finalAfter.team_b).toBe(repo.getMatch(semis[1].id)!.winner);

    const thirdAfter = repo.getMatch(third.id)!;
    expect(thirdAfter.team_a).toBeNull();
    expect(thirdAfter.team_b).toBe(semis[1].team_b);
  });

  it("rifiuta l'annullamento se la finale è già stata giocata", () => {
    const { semis, final } = setupKnockout();
    for (const s of semis) repo.saveScore(s.id, twoZero);
    repo.saveScore(final.id, twoZero);

    expect(() => repo.clearScore(semis[0].id)).toThrow(
      /Annulla prima il risultato della partita successiva/,
    );

    // Niente è stato toccato
    expect(repo.getMatch(semis[0].id)!.status).toBe("finished");
    expect(repo.getMatch(final.id)!.team_a).toBe(
      repo.getMatch(semis[0].id)!.winner,
    );
    expect(repo.getMatch(final.id)!.winner).not.toBeNull();
  });

  it("rifiuta l'annullamento se la finalina è già stata giocata", () => {
    const { semis, third } = setupKnockout();
    for (const s of semis) repo.saveScore(s.id, twoZero);
    repo.saveScore(third.id, twoZero);

    expect(() => repo.clearScore(semis[0].id)).toThrow(
      /Annulla prima il risultato della partita successiva/,
    );
    expect(repo.getMatch(semis[0].id)!.status).toBe("finished");
    expect(repo.getMatch(third.id)!.winner).not.toBeNull();
  });

  it("rifiuta l'annullamento se il turno successivo è stato assegnato a tavolino", () => {
    const { semis, final } = setupKnockout();
    for (const s of semis) repo.saveScore(s.id, twoZero);
    repo.forfeitMatch(final.id, repo.getMatch(final.id)!.team_b!);

    expect(() => repo.clearScore(semis[0].id)).toThrow(
      /Annulla prima il risultato della partita successiva/,
    );
  });

  it("annulla la finale senza dipendenti e azzera il podio", () => {
    const { tournamentId, semis, final } = setupKnockout();
    for (const s of semis) repo.saveScore(s.id, twoZero);
    repo.saveScore(final.id, twoZero);
    expect(repo.podium(tournamentId).first).not.toBeNull();

    repo.clearScore(final.id);

    const finalAfter = repo.getMatch(final.id)!;
    expect(finalAfter.status).toBe("scheduled");
    expect(finalAfter.winner).toBeNull();
    // Le squadre della finale restano: le semifinali sono ancora valide
    expect(finalAfter.team_a).not.toBeNull();
    expect(finalAfter.team_b).not.toBeNull();
    expect(repo.podium(tournamentId).first).toBeNull();
  });
});
