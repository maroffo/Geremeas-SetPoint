// ABOUTME: Test d'integrazione del calendario: giornate/campi CRUD e generateSchedule
// ABOUTME: su un torneo reale con gironi, verificando slot, campi e pausa fissa

import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-sched-test-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function fourPlayers(n: number) {
  return [
    { firstName: `Anna${n}`, lastName: "Rossi", gender: "F" as const },
    { firstName: `Bruno${n}`, lastName: "Bianchi", gender: "M" as const },
    { firstName: `Carlo${n}`, lastName: "Verdi", gender: "M" as const },
    { firstName: `Dario${n}`, lastName: "Neri", gender: "M" as const },
  ];
}

describe("giornate, campi e generazione calendario", () => {
  const id = repo.createTournament({
    name: "Calendario Test",
    year: 2026,
    teamSize: 4,
    format: "groups_only",
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
    matchMinutes: 40,
  });

  it("gestisce giornate e campi con validazione", () => {
    repo.addDay(id, "2026-08-10", "18:00", "20:30");
    repo.addDay(id, "2026-08-11", "18:00", "20:30");
    expect(() => repo.addDay(id, "2026-08-10", "18:00", "20:30")).toThrow(
      /già presente/,
    );
    expect(() => repo.addDay(id, "2026-08-12", "21:00", "20:00")).toThrow(
      /inizio/,
    );
    repo.addCourt(id, "Campo 1");
    repo.addCourt(id, "Campo 2");
    expect(() => repo.addCourt(id, "campo 1")).toThrow(/già/);
    expect(repo.listDays(id)).toHaveLength(2);
    expect(repo.listCourts(id)).toHaveLength(2);
  });

  it("genera il calendario per i gironi rispettando slot e squadre", () => {
    for (let i = 1; i <= 6; i++) {
      const teamId = repo.registerTeam(
        id,
        `Squadra ${i}`,
        `33300000${i}0`,
        fourPlayers(i),
      );
      repo.setTeamStatus(teamId, "active");
    }
    repo.generateGroups(id, 2); // 2 gironi da 3 → 6 partite in 3 round

    const { placed, unplaced } = repo.generateSchedule(id);
    expect(placed).toBe(6);
    expect(unplaced).toBe(0);

    const matches = repo.listMatches(id);
    const teamSlots = new Set<string>();
    for (const m of matches) {
      expect(m.court).not.toBeNull();
      expect(m.scheduled_at).not.toBeNull();
      // Nessuna squadra due volte nello stesso orario
      for (const team of [m.team_a, m.team_b]) {
        const key = `${m.scheduled_at}|${team}`;
        expect(teamSlots.has(key)).toBe(false);
        teamSlots.add(key);
      }
    }
    // 6 partite da 40' su 2 campi: un round per slot, con 5 minuti di pausa.
    const times = [...new Set(matches.map((m) => m.scheduled_at!))].sort();
    expect(times).toEqual([
      "2026-08-10T18:00",
      "2026-08-10T18:45",
      "2026-08-10T19:30",
    ]);

    // Ogni squadra ha almeno 5 minuti tra la fine stimata e l'inizio seguente.
    const timesByTeam = new Map<number, string[]>();
    for (const m of matches)
      for (const team of [m.team_a, m.team_b]) {
        if (team === null) continue;
        timesByTeam.set(team, [...(timesByTeam.get(team) ?? []), m.scheduled_at!]);
      }
    for (const [, slots] of timesByTeam) {
      const sorted = [...slots].sort();
      for (let i = 1; i < sorted.length; i++) {
        const [prevDate, prevTime] = sorted[i - 1].split("T");
        const [date, time] = sorted[i].split("T");
        const gap =
          prevDate === date
            ? Number(time.slice(0, 2)) * 60 +
              Number(time.slice(3)) -
              (Number(prevTime.slice(0, 2)) * 60 + Number(prevTime.slice(3)))
            : Infinity;
        expect(gap).toBeGreaterThanOrEqual(45);
      }
    }
  });

  it("rigenerare riprogramma solo le partite non giocate", () => {
    const matches = repo.listMatches(id);
    const played = matches[0];
    repo.saveScore(played.id, [
      { a: 21, b: 15 },
      { a: 21, b: 12 },
    ]);
    const before = repo.getMatch(played.id)!;

    repo.generateSchedule(id);
    const after = repo.getMatch(played.id)!;
    expect(after.court).toBe(before.court);
    expect(after.scheduled_at).toBe(before.scheduled_at);
    expect(after.status).toBe("finished");
  });

  it("rifiuta orari e date fuori range", () => {
    expect(() => repo.addDay(id, "2026-08-13", "25:00", "27:00")).toThrow(
      /Orario/,
    );
    expect(() => repo.addDay(id, "2026-08-13", "18:00", "18:70")).toThrow(
      /Orario/,
    );
    expect(() => repo.addDay(id, "2026-02-30", "18:00", "20:00")).toThrow(
      /Data/,
    );
  });

  it("programma il tabellone con i round in ordine e finale+3º posto", () => {
    const koId = repo.createTournament({
      name: "Solo Tabellone",
      year: 2026,
      teamSize: 4,
      format: "knockout_only",
      bestOf: 3,
      pointsPerSet: 21,
      pointsLastSet: 15,
      advancePerGroup: 2,
      matchMinutes: 40,
    });
    repo.addDay(koId, "2026-08-12", "17:00", "20:20");
    repo.addCourt(koId, "Centrale");
    repo.addCourt(koId, "Secondario");
    for (let i = 1; i <= 4; i++) {
      const teamId = repo.registerTeam(
        koId,
        `KO ${i}`,
        `35500000${i}0`,
        fourPlayers(i + 20),
      );
      repo.setTeamStatus(teamId, "active");
    }
    repo.generateKnockout(koId);

    const { placed, unplaced } = repo.generateSchedule(koId);
    expect(placed).toBe(4); // 2 semifinali + finale + 3º posto
    expect(unplaced).toBe(0);

    const matches = repo.listMatches(koId);
    const semiTimes = matches
      .filter((m) => m.round === 1)
      .map((m) => m.scheduled_at!);
    const finalTimes = matches
      .filter((m) => m.round === 2)
      .map((m) => m.scheduled_at!);
    expect(finalTimes).toHaveLength(2);
    for (const ft of finalTimes)
      for (const st of semiTimes) expect(ft > st).toBe(true);
  });

  it("cancellare un campo o una giornata ripulisce le partite non giocate", () => {
    const matches = repo.listMatches(id).filter((m) => m.status === "scheduled");
    expect(matches.length).toBeGreaterThan(0);
    const court = repo.listCourts(id).find((c) => c.name === "Campo 1")!;
    repo.deleteCourt(court.id);
    for (const m of repo.listMatches(id).filter((x) => x.status === "scheduled")) {
      expect(m.court === "Campo 1").toBe(false);
    }
    const day = repo.listDays(id).find((d) => d.date === "2026-08-10")!;
    repo.deleteDay(day.id);
    for (const m of repo.listMatches(id).filter((x) => x.status === "scheduled")) {
      expect(m.scheduled_at?.startsWith("2026-08-10") ?? false).toBe(false);
    }
  });

  it("segnala la capienza insufficiente senza fallire", () => {
    const tinyId = repo.createTournament({
      name: "Capienza Minima",
      year: 2026,
      teamSize: 4,
      format: "groups_only",
      bestOf: 3,
      pointsPerSet: 21,
      pointsLastSet: 15,
      advancePerGroup: 2,
      matchMinutes: 60,
    });
    repo.addDay(tinyId, "2026-08-10", "18:00", "20:00"); // 1 slot da 60' + pausa
    repo.addCourt(tinyId, "Unico");
    for (let i = 1; i <= 4; i++) {
      const teamId = repo.registerTeam(
        tinyId,
        `Mini ${i}`,
        `34400000${i}0`,
        fourPlayers(i + 10),
      );
      repo.setTeamStatus(teamId, "active");
    }
    repo.generateGroups(tinyId, 1); // 1 girone da 4 → 6 partite
    const { placed, unplaced } = repo.generateSchedule(tinyId);
    expect(placed).toBe(1);
    expect(unplaced).toBe(5);
  });
});
