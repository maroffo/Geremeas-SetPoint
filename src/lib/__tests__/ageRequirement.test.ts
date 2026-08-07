// ABOUTME: Test del requisito d'età: enforcement all'iscrizione, bounds del torneo
// ABOUTME: e migrazione guardata dei DB creati con lo schema precedente

import { afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-age-test-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");
const { runMigrations } = await import("../db");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function fourPlayers() {
  return [
    { firstName: "Anna", lastName: "Rossi", gender: "F" as const },
    { firstName: "Bruno", lastName: "Bianchi", gender: "M" as const },
    { firstName: "Carlo", lastName: "Verdi", gender: "M" as const },
    { firstName: "Dario", lastName: "Neri", gender: "M" as const },
  ];
}

const base = {
  name: "Over 35",
  year: 2026,
  teamSize: 4,
  format: "groups_knockout" as const,
  bestOf: 3,
  pointsPerSet: 21,
  pointsLastSet: 15,
  advancePerGroup: 2,
};

describe("vincolo d'età all'iscrizione", () => {
  const overId = repo.createTournament({ ...base, minAge: 35 });

  it("rifiuta la squadra senza dichiarazione", () => {
    expect(() =>
      repo.registerTeam(overId, "Vecchie Glorie", "3331234567", fourPlayers()),
    ).toThrow(/almeno 35 anni/);
  });

  it("iscrive la squadra con la dichiarazione e la propaga ai giocatori", () => {
    const teamId = repo.registerTeam(
      overId,
      "Vecchie Glorie",
      "3331234567",
      fourPlayers(),
      true,
    );
    const team = repo.listTeams(overId).find((t) => t.id === teamId);
    expect(team?.age_confirmed).toBe(1);
    const players = repo.teamPlayers(teamId);
    expect(players.length).toBeGreaterThan(0);
    expect(players.every((p) => p.age_confirmed === 1)).toBe(true);
  });

  it("rifiuta contatti non telefonici anche a livello repo", () => {
    expect(() =>
      repo.registerTeam(
        overId,
        "Contatto Email",
        "mario@example.com",
        fourPlayers(),
        true,
      ),
    ).toThrow(/telefono/i);
  });

  it("rifiuta il singolo senza dichiarazione e lo iscrive con", () => {
    const person = {
      firstName: "Elena",
      lastName: "Gialli",
      gender: "F" as const,
      skill: 5,
    };
    expect(() =>
      repo.registerSingle(overId, person, "3339876543"),
    ).toThrow(/almeno 35 anni/);
    expect(
      repo.registerSingle(overId, person, "3339876543", true),
    ).toBeGreaterThan(0);
  });

  it("senza vincoli d'età non chiede nulla", () => {
    const freeId = repo.createTournament({ ...base, name: "Libero" });
    expect(
      repo.registerTeam(freeId, "Squadra Libera", "3331234567", fourPlayers()),
    ).toBeGreaterThan(0);
  });

  it("rifiuta bounds incoerenti o assurdi", () => {
    expect(() =>
      repo.createTournament({ ...base, minAge: 40, maxAge: 30 }),
    ).toThrow(/minima/);
    expect(() => repo.createTournament({ ...base, minAge: 0 })).toThrow(
      /non valida/,
    );
    expect(() => repo.createTournament({ ...base, maxAge: 121 })).toThrow(
      /non valida/,
    );
  });
});

describe("migrazione dei DB con schema precedente", () => {
  it("aggiunge le colonne mancanti ed è idempotente", () => {
    const legacyPath = path.join(dbDir, "legacy.db");
    const legacy = new Database(legacyPath);
    legacy.exec(`
      CREATE TABLE tournaments (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE players (id INTEGER PRIMARY KEY, first_name TEXT NOT NULL);
    `);

    runMigrations(legacy);
    runMigrations(legacy);

    const cols = (table: string) =>
      (legacy.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
        (c) => c.name,
      );
    expect(cols("tournaments")).toContain("min_age");
    expect(cols("tournaments")).toContain("max_age");
    expect(cols("teams")).toContain("age_confirmed");
    expect(cols("players")).toContain("age_confirmed");
    legacy.close();
  });
});
