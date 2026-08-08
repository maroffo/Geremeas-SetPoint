// ABOUTME: Test dell'archivio edizioni: listing dei soli tornei finished e vista read-only
// ABOUTME: Il vincolo forte è che la vista d'archivio non porti contact_info né dati sensibili dei giocatori

import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-archivio-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");
const view = await import("../view");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

const CAPTAIN_PHONE = "3339998877";
const TOURNAMENT_PHONE = "3701234567";

/** Le Map non sopravvivono a JSON.stringify: qui diventano oggetti. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v instanceof Map ? Object.fromEntries(v) : v,
  );
}

function fourPlayers() {
  return [
    { firstName: "Anna", lastName: "Rossi", gender: "F" as const },
    { firstName: "Bruno", lastName: "Bianchi", gender: "M" as const },
    { firstName: "Carlo", lastName: "Verdi", gender: "M" as const },
    { firstName: "Dario", lastName: "Neri", gender: "M" as const },
  ];
}

const twoZero = [
  { a: 21, b: 10 },
  { a: 21, b: 12 },
];

function newTournament(name: string, year: number) {
  return repo.createTournament({
    name,
    year,
    teamSize: 4,
    format: "groups_knockout",
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
    contactInfo: `Info al ${TOURNAMENT_PHONE}`,
  });
}

// Edizione conclusa: 2 gironi da 2, semifinali, finale e finalina, poi finished.
const finishedId = newTournament("Edizione conclusa", 2025);
const finishedTeams = [1, 2, 3, 4].map((i) => {
  const id = repo.registerTeam(
    finishedId,
    `Squadra ${i}`,
    CAPTAIN_PHONE,
    fourPlayers(),
  );
  repo.setTeamStatus(id, "active");
  return id;
});
repo.generateGroups(finishedId, 2);
for (const m of repo.listMatches(finishedId)) repo.saveScore(m.id, twoZero);
repo.generateKnockout(finishedId);
for (const round of [1, 2]) {
  const matches = repo
    .listMatches(finishedId)
    .filter((m) => m.phase === "knockout" && m.round === round);
  for (const m of matches) repo.saveScore(m.id, twoZero);
}
repo.setTournamentStatus(finishedId, "finished");

// Edizione in corso: creata dopo, quindi è quella attiva (ultimo id).
const activeId = newTournament("Edizione in corso", 2026);
const activeTeam = repo.registerTeam(
  activeId,
  "Squadra in gara",
  CAPTAIN_PHONE,
  fourPlayers(),
);
repo.setTeamStatus(activeTeam, "active");

describe("listFinishedTournaments", () => {
  const editions = repo.listFinishedTournaments();

  it("elenca il torneo concluso e non quello in corso", () => {
    expect(repo.getActiveTournament()!.id).toBe(activeId);
    expect(editions.map((e) => e.id)).toEqual([finishedId]);
    expect(editions.map((e) => e.name)).not.toContain("Edizione in corso");
  });

  it("porta il podio già risolto in nomi di squadra", () => {
    const names = new Map(
      repo.listTeams(finishedId).map((t) => [t.id, t.name]),
    );
    const p = repo.podium(finishedId);
    expect(p.first).not.toBeNull();
    expect(editions[0].podium.first).toBe(names.get(p.first!));
    expect(editions[0].podium.second).toBe(names.get(p.second!));
    expect(editions[0].podium.third).toBe(names.get(p.third!));
  });

  it("non porta contatti né dati dei giocatori", () => {
    const payload = serialize(editions);
    expect(payload).not.toContain(TOURNAMENT_PHONE);
    expect(payload).not.toContain(CAPTAIN_PHONE);
    expect(payload).not.toContain("skill");
    expect(payload).not.toContain("age_confirmed");
  });
});

describe("buildArchiveView, edizione conclusa", () => {
  const archive = view.buildArchiveView(finishedId)!;

  it("espone nome, anno, gironi con classifiche e partite", () => {
    expect(archive).not.toBeNull();
    expect(archive.name).toBe("Edizione conclusa");
    expect(archive.year).toBe(2025);
    expect(archive.groups).toHaveLength(2);
    expect(archive.groups.map((g) => g.name)).toEqual(["Girone A", "Girone B"]);
    for (const g of archive.groups) {
      expect(g.standings).toHaveLength(2);
      expect(g.matches).toHaveLength(1);
      expect(g.matches[0].status).toBe("finished");
      expect(g.matches[0].sets).toHaveLength(2);
    }
    // I nomi delle squadre servono a classifiche e tabellone
    for (const id of finishedTeams) expect(archive.teamNames.get(id)).toBeTruthy();
  });

  it("espone il tabellone con i risultati e il podio", () => {
    expect(archive.totalKnockoutRounds).toBe(2);
    expect(archive.knockoutRounds).toHaveLength(2);
    expect(archive.knockoutRounds[0]).toHaveLength(2); // semifinali
    expect(archive.knockoutRounds[1]).toHaveLength(1); // finale
    expect(archive.thirdPlace).not.toBeNull();
    expect(archive.thirdPlace!.winner).not.toBeNull();

    const final = archive.knockoutRounds[1][0];
    expect(final.winner).toBe(archive.podium.first);
    expect(final.sets).toHaveLength(2);
    expect(archive.podium.second).not.toBeNull();
    expect(archive.podium.third).toBe(archive.thirdPlace!.winner);
  });

  it("non contiene contact_info né dati sensibili dei giocatori", () => {
    // Controllo positivo: le righe grezze contengono davvero ciò che la vista
    // non deve contenere, altrimenti le asserzioni sotto passerebbero anche
    // con una vista rotta.
    const rawTournament = JSON.stringify(repo.getTournament(finishedId));
    expect(rawTournament).toContain(TOURNAMENT_PHONE);
    const rawTeam = JSON.stringify(
      repo.listTeams(finishedId).find((t) => t.id === finishedTeams[0]),
    );
    expect(rawTeam).toContain(CAPTAIN_PHONE);
    const rawPlayers = JSON.stringify(repo.teamPlayers(finishedTeams[0]));
    expect(rawPlayers).toContain("skill");
    expect(rawPlayers).toContain("age_confirmed");

    const payload = serialize(archive);
    // La Map dei nomi entra davvero nel payload: senza il replacer le
    // asserzioni negative passerebbero su un oggetto vuoto.
    expect(payload).toContain("Squadra 1");
    expect(payload).not.toContain(TOURNAMENT_PHONE);
    expect(payload).not.toContain(CAPTAIN_PHONE);
    expect(payload).not.toContain("skill");
    expect(payload).not.toContain("contact");
    expect(payload).not.toContain("age_confirmed");
    // I nomi dei giocatori non fanno parte della vista d'archivio
    expect(payload).not.toContain("Bianchi");
  });
});

describe("buildArchiveView, casi da 404", () => {
  it("torneo in corso", () => {
    expect(view.buildArchiveView(activeId)).toBeNull();
  });

  it("id inesistente", () => {
    expect(view.buildArchiveView(999999)).toBeNull();
  });

  it("torneo tornato in corso dopo essere stato concluso", () => {
    repo.setTournamentStatus(finishedId, "knockout");
    expect(view.buildArchiveView(finishedId)).toBeNull();
    expect(repo.listFinishedTournaments()).toHaveLength(0);
    repo.setTournamentStatus(finishedId, "finished");
  });
});
