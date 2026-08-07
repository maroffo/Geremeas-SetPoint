import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-test-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function fourPlayers(femaleCount: number) {
  const people = [];
  for (let i = 0; i < 4; i++) {
    people.push({
      firstName: `Nome${i}`,
      lastName: `Cognome${i}`,
      gender: i < femaleCount ? ("F" as const) : ("M" as const),
    });
  }
  return people;
}

describe("flusso completo del torneo", () => {
  const tournamentId = repo.createTournament({
    name: "Torneo Test",
    year: 2026,
    teamSize: 4,
    format: "groups_knockout",
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
  });

  it("rifiuta squadre senza ragazze", () => {
    expect(() =>
      repo.registerTeam(tournamentId, "Solo Maschi", "3330000000", fourPlayers(0)),
    ).toThrow(/ragazza/i);
  });

  it("iscrive squadre valide", () => {
    for (let i = 1; i <= 4; i++) {
      const teamId = repo.registerTeam(
        tournamentId,
        `Squadra ${i}`,
        `33312345${i}`,
        fourPlayers(1),
      );
      repo.setTeamStatus(teamId, "active");
    }
    expect(repo.listActiveTeams(tournamentId)).toHaveLength(4);
  });

  it("rifiuta nomi squadra duplicati", () => {
    expect(() =>
      repo.registerTeam(tournamentId, "squadra 1", "3330000000", fourPlayers(1)),
    ).toThrow(/nome/i);
  });

  it("genera squadre bilanciate dai singoli", () => {
    const genders: ("M" | "F")[] = ["F", "F", "M", "M", "M", "M", "M", "M"];
    genders.forEach((g, i) => {
      repo.registerSingle(
        tournamentId,
        {
          firstName: `Single${i}`,
          lastName: `Player${i}`,
          gender: g,
          skill: (i % 10) + 1,
        },
        "3330000000",
      );
    });

    const { created, reserves } = repo.generateTeamsFromSingles(tournamentId);
    expect(created).toBe(2);
    expect(reserves).toBe(0);
    expect(repo.listActiveTeams(tournamentId)).toHaveLength(6);

    // Ogni squadra generata ha una ragazza
    for (const team of repo.listActiveTeams(tournamentId)) {
      const players = repo.teamPlayers(team.id);
      expect(players.some((p) => p.gender === "F")).toBe(true);
    }
  });

  it("crea 2 gironi da 3 con calendario round robin", () => {
    repo.generateGroups(tournamentId, 2);
    const groups = repo.listGroups(tournamentId);
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(repo.groupTeams(g.id)).toHaveLength(3);
    }
    const matches = repo
      .listMatches(tournamentId)
      .filter((m) => m.phase === "group");
    expect(matches).toHaveLength(6); // 3 per girone
    expect(repo.getTournament(tournamentId)!.status).toBe("groups");
  });

  it("registra i punteggi e aggiorna la classifica", () => {
    const matches = repo
      .listMatches(tournamentId)
      .filter((m) => m.phase === "group");
    for (const m of matches) {
      // Vince sempre la squadra con id più basso
      const aWins = m.team_a! < m.team_b!;
      repo.saveScore(m.id, [
        { a: aWins ? 21 : 15, b: aWins ? 15 : 21 },
        { a: aWins ? 21 : 12, b: aWins ? 12 : 21 },
      ]);
    }

    const groups = repo.listGroups(tournamentId);
    const standings = repo.groupStandings(groups[0].id);
    expect(standings).toHaveLength(3);
    expect(standings[0].points).toBe(6); // 2 vittorie 2-0
    expect(standings[0].played).toBe(2);
  });

  it("rifiuta punteggi non validi", () => {
    const m = repo
      .listMatches(tournamentId)
      .find((x) => x.phase === "group")!;
    expect(() => repo.saveScore(m.id, [{ a: 21, b: 20 }])).toThrow();
  });

  it("genera il tabellone a eliminazione con seeding dai gironi", () => {
    repo.generateKnockout(tournamentId);
    const knockout = repo
      .listMatches(tournamentId)
      .filter((m) => m.phase === "knockout");
    // 4 qualificate → semifinali (2) + finale (1) + 3º posto (1)
    expect(knockout).toHaveLength(4);
    expect(repo.getTournament(tournamentId)!.status).toBe("knockout");

    const semis = knockout.filter((m) => m.round === 1);
    expect(semis).toHaveLength(2);
    for (const s of semis) {
      expect(s.team_a).not.toBeNull();
      expect(s.team_b).not.toBeNull();
    }
  });

  it("il vincitore avanza e si assegna il podio", () => {
    const semis = repo
      .listMatches(tournamentId)
      .filter((m) => m.phase === "knockout" && m.round === 1);
    for (const s of semis) {
      repo.saveScore(s.id, [
        { a: 21, b: 10 },
        { a: 21, b: 12 },
      ]);
    }

    const finalRound = repo
      .listMatches(tournamentId)
      .filter((m) => m.phase === "knockout" && m.round === 2);
    const final = finalRound.find((m) => !m.is_third_place)!;
    const third = finalRound.find((m) => m.is_third_place)!;
    expect(final.team_a).not.toBeNull();
    expect(final.team_b).not.toBeNull();
    expect(third.team_a).not.toBeNull();
    expect(third.team_b).not.toBeNull();

    repo.saveScore(third.id, [
      { a: 15, b: 21 },
      { a: 21, b: 23 },
    ]);
    repo.saveScore(final.id, [
      { a: 21, b: 18 },
      { a: 19, b: 21 },
      { a: 15, b: 11 },
    ]);

    const podium = repo.podium(tournamentId);
    expect(podium.first).toBe(final.team_a);
    expect(podium.second).toBe(final.team_b);
    expect(podium.third).toBe(third.team_b);
  });

  it("gestisce il forfait con vittoria a tavolino", () => {
    const t2 = repo.createTournament({
      name: "Torneo Forfait",
      year: 2026,
      teamSize: 4,
      format: "groups_only",
      bestOf: 3,
      pointsPerSet: 21,
      pointsLastSet: 15,
      advancePerGroup: 2,
    });
    const a = repo.registerTeam(t2, "A", "3330000001", fourPlayers(1));
    const b = repo.registerTeam(t2, "B", "3330000002", fourPlayers(1));
    repo.setTeamStatus(a, "active");
    repo.setTeamStatus(b, "active");
    repo.generateGroups(t2, 1);

    const m = repo.listMatches(t2)[0];
    repo.forfeitMatch(m.id, m.team_b!);

    const updated = repo.getMatch(m.id)!;
    expect(updated.status).toBe("forfeit");
    expect(updated.winner).toBe(m.team_a);

    const standings = repo.groupStandings(m.group_id!);
    expect(standings[0].teamId).toBe(m.team_a);
    expect(standings[0].points).toBe(3);
  });
});
