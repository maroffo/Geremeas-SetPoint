// ABOUTME: Test della vista pubblica di una squadra: scoping (torneo attivo + stato attivo) e payload
// ABOUTME: Il vincolo forte è che skill, contact e age_confirmed non escano mai dal repo

import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-teamview-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

const CAPTAIN_PHONE = "3339998877";

function fourPlayers() {
  return [
    { firstName: "Anna", lastName: "Rossi", gender: "F" as const },
    { firstName: "Bruno", lastName: "Bianchi", gender: "M" as const },
    { firstName: "Carlo", lastName: "Verdi", gender: "M" as const },
    { firstName: "Dario", lastName: "Neri", gender: "M" as const },
  ];
}

function newTournament(name: string) {
  return repo.createTournament({
    name,
    year: 2026,
    teamSize: 4,
    format: "groups_only",
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
  });
}

// Torneo "vecchio": resterà attivo finché non ne creiamo un altro
const oldTournament = newTournament("Edizione passata");
const oldTeam = repo.registerTeam(
  oldTournament,
  "Vecchia Gloria",
  CAPTAIN_PHONE,
  fourPlayers(),
);
repo.setTeamStatus(oldTeam, "active");

// Torneo in corso: diventa quello attivo (ultimo per id)
const tournament = newTournament("Torneo in corso");
const teamIds = [1, 2, 3, 4].map((i) => {
  const id = repo.registerTeam(
    tournament,
    `Squadra ${i}`,
    CAPTAIN_PHONE,
    fourPlayers(),
  );
  repo.setTeamStatus(id, "active");
  return id;
});
const pendingTeam = repo.registerTeam(
  tournament,
  "In attesa",
  CAPTAIN_PHONE,
  fourPlayers(),
);
const withdrawnTeam = repo.registerTeam(
  tournament,
  "Ritirata",
  CAPTAIN_PHONE,
  fourPlayers(),
);
repo.setTeamStatus(withdrawnTeam, "withdrawn");

repo.generateGroups(tournament, 1);
const firstMatch = repo
  .listMatches(tournament)
  .find((m) => m.team_a === teamIds[0] || m.team_b === teamIds[0])!;
repo.saveScore(firstMatch.id, [
  { a: 21, b: 10 },
  { a: 21, b: 12 },
]);

describe("getTeamPublicView, squadra attiva del torneo attivo", () => {
  const view = repo.getTeamPublicView(teamIds[0])!;

  it("espone nome squadra, giocatori e torneo", () => {
    expect(view).not.toBeNull();
    expect(view.teamName).toBe("Squadra 1");
    expect(view.tournamentName).toBe("Torneo in corso");
    expect(view.players).toHaveLength(4);
    expect(view.players[0]).toEqual({
      firstName: "Bruno",
      lastName: "Bianchi",
      gender: "M",
    });
    expect(view.players.filter((p) => p.gender === "F")).toHaveLength(1);
  });

  it("espone le partite della squadra con nomi avversari e set", () => {
    // Girone unico da 4 squadre: 3 partite per squadra
    expect(view.matches).toHaveLength(3);
    expect(view.matches.every((m) => m.team_a === teamIds[0] || m.team_b === teamIds[0])).toBe(true);

    const played = view.matches.find((m) => m.id === firstMatch.id)!;
    expect(played.status).toBe("finished");
    expect(played.sets).toHaveLength(2);
    expect([played.teamAName, played.teamBName]).toContain("Squadra 1");
    expect(played.teamAName).not.toBe(played.teamBName);
  });

  it("espone la classifica del girone della squadra", () => {
    expect(view.group?.name).toBe("Girone A");
    expect(view.group?.standings).toHaveLength(4);
    expect(view.group?.standings.map((s) => s.teamName).sort()).toEqual([
      "Squadra 1",
      "Squadra 2",
      "Squadra 3",
      "Squadra 4",
    ]);
    const total = view.group!.standings.reduce((n, s) => n + s.played, 0);
    expect(total).toBe(2); // una sola partita giocata, conta per due squadre
  });

  it("non contiene dati sensibili nel payload", () => {
    // Controllo positivo: le righe grezze contengono davvero ciò che il
    // payload pubblico non deve contenere, altrimenti le asserzioni sotto
    // passerebbero anche con un repo rotto.
    const rawPlayers = JSON.stringify(repo.teamPlayers(teamIds[0]));
    expect(rawPlayers).toContain("skill");
    expect(rawPlayers).toContain("age_confirmed");
    const rawTeam = JSON.stringify(
      repo.listTeams(tournament).find((t) => t.id === teamIds[0]),
    );
    expect(rawTeam).toContain(CAPTAIN_PHONE);

    const payload = JSON.stringify(view);
    expect(payload).not.toContain("skill");
    expect(payload).not.toContain("contact");
    expect(payload).not.toContain("age_confirmed");
    expect(payload).not.toContain(CAPTAIN_PHONE);
  });
});

describe("getTeamPublicView, casi da 404", () => {
  it("id inesistente", () => {
    expect(repo.getTeamPublicView(999999)).toBeNull();
  });

  it("squadra in attesa di conferma", () => {
    expect(repo.getTeamPublicView(pendingTeam)).toBeNull();
  });

  it("squadra ritirata", () => {
    expect(repo.getTeamPublicView(withdrawnTeam)).toBeNull();
  });

  it("squadra attiva ma di un'edizione passata", () => {
    expect(repo.getTeamPublicView(oldTeam)).toBeNull();
  });
});
