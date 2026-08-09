import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-test-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");
const { buildTournamentView } = await import("../view");

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
    ).toThrow(/donna/i);
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

    // Ogni squadra generata ha una donna
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

function createSmallTournament(
  teamCount: number,
  format: "groups_knockout" | "groups_only" | "knockout_only" =
    "groups_knockout",
): {
  tournamentId: number;
  teamIds: number[];
} {
  const tournamentId = repo.createTournament({
    name: `Torneo ${teamCount} squadre`,
    year: 2026,
    teamSize: 4,
    format,
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
  });
  const teamIds: number[] = [];
  for (let i = 1; i <= teamCount; i++) {
    const teamId = repo.registerTeam(
      tournamentId,
      `Piccola ${teamCount}-${i}`,
      `555${teamCount}${i}`,
      fourPlayers(1),
    );
    repo.setTeamStatus(teamId, "active");
    teamIds.push(teamId);
  }
  return { tournamentId, teamIds };
}

function finishRoundRobinWithRegistrationOrder(tournamentId: number): void {
  const matches = repo
    .listMatches(tournamentId)
    .filter((m) => m.phase === "group");
  for (const match of matches) {
    const aWins = match.team_a! < match.team_b!;
    repo.saveScore(match.id, [
      { a: aWins ? 21 : 10, b: aWins ? 10 : 21 },
      { a: aWins ? 21 : 12, b: aWins ? 12 : 21 },
    ]);
  }
}

describe("formula per tornei con meno di 6 squadre", () => {
  it.each([2, 3])(
    "%i squadre: richiede il girone unico prima del tabellone",
    (teamCount) => {
      const { tournamentId, teamIds } = createSmallTournament(teamCount);

      expect(() => repo.generateKnockout(tournamentId)).toThrow(/girone unico/i);
      expect(() => repo.generateGroups(tournamentId, 2)).toThrow(/girone unico/i);
      repo.generateGroups(tournamentId, 1);
      expect(repo.listGroups(tournamentId)).toHaveLength(1);
      expect(
        repo.listMatches(tournamentId).filter((m) => m.phase === "group"),
      ).toHaveLength((teamCount * (teamCount - 1)) / 2);

      finishRoundRobinWithRegistrationOrder(tournamentId);
      repo.generateKnockout(tournamentId);
      expect(
        repo
          .listMatches(tournamentId)
          .filter((m) => m.phase === "knockout" && m.is_third_place),
      ).toHaveLength(0);
      const firstPlayedRound = repo
        .listMatches(tournamentId)
        .filter(
          (m) =>
            m.phase === "knockout" &&
            m.round === 1 &&
            m.team_a !== null &&
            m.team_b !== null,
        );
      expect(firstPlayedRound).toHaveLength(1);
      expect([firstPlayedRound[0].team_a, firstPlayedRound[0].team_b]).toEqual(
        teamCount === 2
          ? [teamIds[0], teamIds[1]]
          : [teamIds[1], teamIds[2]],
      );
    },
  );

  it("4 squadre: impone il girone unico e genera le semifinali 1ª-4ª, 2ª-3ª", () => {
    const { tournamentId, teamIds } = createSmallTournament(4);

    expect(() => repo.generateKnockout(tournamentId)).toThrow(/girone unico/i);
    expect(() => repo.generateGroups(tournamentId, 2)).toThrow(/girone unico/i);
    repo.generateGroups(tournamentId, 1);
    expect(repo.listGroups(tournamentId)).toHaveLength(1);
    expect(
      repo.listMatches(tournamentId).filter((m) => m.phase === "group"),
    ).toHaveLength(6);

    finishRoundRobinWithRegistrationOrder(tournamentId);
    repo.generateKnockout(tournamentId);

    const semifinals = repo
      .listMatches(tournamentId)
      .filter(
        (m) =>
          m.phase === "knockout" &&
          m.round === 1 &&
          !m.is_third_place,
      );
    expect(semifinals).toHaveLength(2);
    expect(semifinals.map((m) => [m.team_a, m.team_b])).toEqual([
      [teamIds[0], teamIds[3]],
      [teamIds[1], teamIds[2]],
    ]);
  });

  it("5 squadre: 4ª-5ª giocano il quarto e la vincente affronta la 1ª", () => {
    const { tournamentId, teamIds } = createSmallTournament(5);

    expect(() => repo.generateKnockout(tournamentId)).toThrow(/girone unico/i);
    expect(() => repo.generateGroups(tournamentId, 2)).toThrow(/girone unico/i);
    repo.generateGroups(tournamentId, 1);
    expect(repo.listGroups(tournamentId)).toHaveLength(1);
    expect(
      repo.listMatches(tournamentId).filter((m) => m.phase === "group"),
    ).toHaveLength(10);

    finishRoundRobinWithRegistrationOrder(tournamentId);
    repo.generateKnockout(tournamentId);

    const knockout = repo
      .listMatches(tournamentId)
      .filter((m) => m.phase === "knockout" && !m.is_third_place);
    const quarterfinals = knockout.filter((m) => m.round === 1);
    const playedQuarterfinals = quarterfinals.filter(
      (m) => m.team_a !== null && m.team_b !== null,
    );
    expect(playedQuarterfinals).toHaveLength(1);
    expect([
      playedQuarterfinals[0].team_a,
      playedQuarterfinals[0].team_b,
    ]).toEqual([teamIds[3], teamIds[4]]);
    const view = buildTournamentView(repo.getTournament(tournamentId)!);
    expect(view.knockoutRounds[0]).toHaveLength(1);
    expect([
      view.knockoutRounds[0][0].team_a,
      view.knockoutRounds[0][0].team_b,
    ]).toEqual([teamIds[3], teamIds[4]]);

    const semifinals = knockout.filter((m) => m.round === 2);
    expect(semifinals.map((m) => [m.team_a, m.team_b])).toEqual([
      [teamIds[0], null],
      [teamIds[1], teamIds[2]],
    ]);

    repo.saveScore(playedQuarterfinals[0].id, [
      { a: 21, b: 10 },
      { a: 21, b: 12 },
    ]);
    const firstSemifinal = repo
      .listMatches(tournamentId)
      .find(
        (m) =>
          m.phase === "knockout" &&
          m.round === 2 &&
          m.bracket_pos === 0,
      )!;
    expect([firstSemifinal.team_a, firstSemifinal.team_b]).toEqual([
      teamIds[0],
      teamIds[3],
    ]);
  });

  it("blocca un girone da 5 diventato obsoleto dopo l'attivazione della 6ª squadra", () => {
    const { tournamentId } = createSmallTournament(5);
    repo.generateGroups(tournamentId, 1);
    finishRoundRobinWithRegistrationOrder(tournamentId);

    repo.setTournamentStatus(tournamentId, "registration");
    const sixthTeam = repo.registerTeam(
      tournamentId,
      "Squadra numero sei",
      "555-sixth",
      fourPlayers(1),
    );
    repo.setTeamStatus(sixthTeam, "active");

    expect(repo.listActiveTeams(tournamentId)).toHaveLength(6);
    expect(() => repo.generateKnockout(tournamentId)).toThrow(
      /rigenerare i gironi/i,
    );
  });

  it("blocca il tabellone se cambia una squadra mantenendo lo stesso totale", () => {
    const { tournamentId, teamIds } = createSmallTournament(5);
    repo.generateGroups(tournamentId, 1);
    finishRoundRobinWithRegistrationOrder(tournamentId);

    repo.setTournamentStatus(tournamentId, "registration");
    repo.setTeamStatus(teamIds[4], "withdrawn");
    const replacement = repo.registerTeam(
      tournamentId,
      "Squadra sostitutiva",
      "555-replacement",
      fourPlayers(1),
    );
    repo.setTeamStatus(replacement, "active");

    expect(repo.listActiveTeams(tournamentId)).toHaveLength(5);
    expect(() => repo.generateKnockout(tournamentId)).toThrow(/girone unico/i);

    repo.generateGroups(tournamentId, 1);
    const regeneratedTeamIds = repo
      .groupTeams(repo.listGroups(tournamentId)[0].id)
      .map((team) => team.id);
    expect(regeneratedTeamIds).toContain(replacement);
    expect(regeneratedTeamIds).not.toContain(teamIds[4]);
  });

  it("non forza il girone unico nel formato solo gironi", () => {
    const { tournamentId } = createSmallTournament(4, "groups_only");

    expect(() => repo.generateGroups(tournamentId, 2)).not.toThrow();
    expect(repo.listGroups(tournamentId)).toHaveLength(2);
  });

  it("mantiene il percorso diretto del formato a sola eliminazione", () => {
    const { tournamentId } = createSmallTournament(5, "knockout_only");
    repo.generateGroups(tournamentId, 1);

    expect(() => repo.generateKnockout(tournamentId)).not.toThrow();
    expect(
      repo.listMatches(tournamentId).filter((m) => m.phase === "knockout"),
    ).not.toHaveLength(0);
  });
});
