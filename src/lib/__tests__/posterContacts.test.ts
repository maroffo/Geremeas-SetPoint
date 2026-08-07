// ABOUTME: Test di locandina (roundtrip BLOB) e aggiornamento contatti da admin
// ABOUTME: con validazione telefonica anche sul percorso di modifica

import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-poster-test-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

const base = {
  name: "Con Locandina",
  year: 2026,
  teamSize: 4,
  format: "groups_knockout" as const,
  bestOf: 3,
  pointsPerSet: 21,
  pointsLastSet: 15,
  advancePerGroup: 2,
};

describe("locandina", () => {
  const id = repo.createTournament({
    ...base,
    contactInfo: "Laura 348 8804992\nManuel 328 6267017",
  });

  it("salva le info di contatto del torneo", () => {
    expect(repo.getTournament(id)?.contact_info).toContain("Laura");
  });

  it("senza upload non c'è locandina", () => {
    expect(repo.hasPoster(id)).toBe(false);
    expect(repo.getPoster(id)).toBeUndefined();
  });

  it("salva e rilegge il BLOB, e la sostituzione sovrascrive", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    repo.setPoster(id, { data: jpeg, mime: "image/jpeg" });
    expect(repo.hasPoster(id)).toBe(true);
    const readBack = repo.getPoster(id);
    expect(readBack?.mime).toBe("image/jpeg");
    expect(Buffer.compare(readBack!.data, jpeg)).toBe(0);

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    repo.setPoster(id, { data: png, mime: "image/png" });
    const replaced = repo.getPoster(id);
    expect(replaced?.mime).toBe("image/png");
    expect(Buffer.compare(replaced!.data, png)).toBe(0);
  });
});

describe("modifica contatti da admin", () => {
  const id = repo.createTournament(base);
  const teamId = repo.registerTeam(id, "Squadra Contatti", "3330000000", [
    { firstName: "Anna", lastName: "Rossi", gender: "F" },
    { firstName: "Bruno", lastName: "Bianchi", gender: "M" },
    { firstName: "Carlo", lastName: "Verdi", gender: "M" },
    { firstName: "Dario", lastName: "Neri", gender: "M" },
  ]);

  it("aggiorna il contatto squadra con un telefono valido", () => {
    repo.updateTeamContact(teamId, "+39 348 8804992");
    const team = repo.listTeams(id).find((t) => t.id === teamId);
    expect(team?.contact).toBe("+39 348 8804992");
  });

  it("rifiuta contatti non telefonici", () => {
    expect(() => repo.updateTeamContact(teamId, "scrivimi su IG")).toThrow(
      /telefono/i,
    );
    const single = repo.registerSingle(
      id,
      { firstName: "Elena", lastName: "Gialli", gender: "F", skill: 6 },
      "3339876543",
    );
    expect(() => repo.updatePlayerContact(single, "email@example.com")).toThrow(
      /telefono/i,
    );
    repo.updatePlayerContact(single, "328 6267017");
    const found = repo
      .listUnassignedSingles(id)
      .find((p) => p.id === single);
    expect(found?.contact).toBe("328 6267017");
  });
});
