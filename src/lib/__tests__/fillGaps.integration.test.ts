// ABOUTME: Test d'integrazione di fillScheduleGaps: completa il calendario a torneo
// ABOUTME: iniziato senza toccare l'esistente, senza collisioni e senza orari passati

import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-fillgaps-test-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const repo = await import("../repo");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

/** Agosto è CEST (+2): 16:30Z sono le 18:30 di Roma. */
const romeClock = (utc: string) => new Date(utc);

function fourPlayers(n: number) {
  return [
    { firstName: `Anna${n}`, lastName: "Rossi", gender: "F" as const },
    { firstName: `Bruno${n}`, lastName: "Bianchi", gender: "M" as const },
    { firstName: `Carlo${n}`, lastName: "Verdi", gender: "M" as const },
    { firstName: `Dario${n}`, lastName: "Neri", gender: "M" as const },
  ];
}

let phoneSeed = 3300000000;

/** Torneo con 4 squadre in un girone (6 partite in 3 round) già calendarizzate. */
function tournamentWithSchedule(name: string): number {
  const id = repo.createTournament({
    name,
    year: 2026,
    teamSize: 4,
    format: "groups_only",
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
    matchMinutes: 40,
  });
  repo.addDay(id, "2026-08-10", "18:00", "21:20"); // 4 slot da 40' + pausa
  repo.addCourt(id, "Campo 1");
  repo.addCourt(id, "Campo 2");
  for (let i = 1; i <= 4; i++) {
    const teamId = repo.registerTeam(
      id,
      `${name} ${i}`,
      String(++phoneSeed),
      fourPlayers(i),
    );
    repo.setTeamStatus(teamId, "active");
  }
  repo.generateGroups(id, 1);
  repo.generateSchedule(id);
  return id;
}

const byRound = (id: number, round: number) =>
  repo.listMatches(id).filter((m) => m.round === round);

describe("fillScheduleGaps", () => {
  it("programma i buchi dopo l'ultimo slot occupato, senza toccare l'esistente", () => {
    const id = tournamentWithSchedule("Buchi");
    // Il calendario pieno usa 18:00, 18:45 e 19:30 (40' + 5' di pausa).
    expect(byRound(id, 1)[0].scheduled_at).toBe("2026-08-10T18:00");
    expect(byRound(id, 2)[0].scheduled_at).toBe("2026-08-10T18:45");

    // Round 1 giocato, round 3 rimasto senza orario (partite aggiunte dopo).
    for (const m of byRound(id, 1))
      repo.saveScore(m.id, [
        { a: 21, b: 15 },
        { a: 21, b: 12 },
      ]);
    for (const m of byRound(id, 3)) repo.scheduleMatch(m.id, null, null);
    const before = repo
      .listMatches(id)
      .filter((m) => m.scheduled_at !== null)
      .map((m) => ({ id: m.id, at: m.scheduled_at, court: m.court }));

    const { placed, unplaced } = repo.fillScheduleGaps(
      id,
      romeClock("2026-08-10T16:30:00Z"), // 18:30 a Roma, torneo in corso
    );
    expect({ placed, unplaced }).toEqual({ placed: 2, unplaced: 0 });

    // Le partite giocate e quelle già in programma non si muovono di un minuto.
    const after = new Map(repo.listMatches(id).map((m) => [m.id, m]));
    for (const snapshot of before) {
      expect(after.get(snapshot.id)!.scheduled_at).toBe(snapshot.at);
      expect(after.get(snapshot.id)!.court).toBe(snapshot.court);
    }
    expect(byRound(id, 1).every((m) => m.status === "finished")).toBe(true);

    // Le nuove partite stanno dopo la fine stimata del round delle 18:45.
    for (const m of byRound(id, 3)) {
      expect(m.scheduled_at).toBe("2026-08-10T19:30");
      expect(m.court).not.toBeNull();
    }

    // Nessuna collisione campo+orario e nessuna squadra due volte nello stesso slot.
    const slots = new Set<string>();
    const teamSlots = new Set<string>();
    for (const m of repo.listMatches(id)) {
      const key = `${m.scheduled_at}|${m.court}`;
      expect(slots.has(key)).toBe(false);
      slots.add(key);
      for (const team of [m.team_a, m.team_b]) {
        const teamKey = `${m.scheduled_at}|${team}`;
        expect(teamSlots.has(teamKey)).toBe(false);
        teamSlots.add(teamKey);
      }
    }
  });

  it("rispetta fine e pausa anche su un calendario creato col vecchio passo", () => {
    const id = tournamentWithSchedule("Legacy");
    for (const m of byRound(id, 1))
      repo.scheduleMatch(m.id, m.court, "2026-08-10T18:00");
    for (const m of byRound(id, 2))
      repo.scheduleMatch(m.id, m.court, "2026-08-10T19:20");
    for (const m of byRound(id, 3)) repo.scheduleMatch(m.id, null, null);

    const { placed, unplaced } = repo.fillScheduleGaps(
      id,
      romeClock("2026-08-10T16:30:00Z"),
    );
    expect({ placed, unplaced }).toEqual({ placed: 2, unplaced: 0 });
    for (const m of byRound(id, 3))
      expect(m.scheduled_at).toBe("2026-08-10T20:15");
  });

  it("non usa lo slot del minuto corrente quando sono già trascorsi secondi", () => {
    const id = tournamentWithSchedule("Secondi");
    for (const round of [2, 3])
      for (const m of byRound(id, round)) repo.scheduleMatch(m.id, null, null);

    const result = repo.fillScheduleGaps(
      id,
      romeClock("2026-08-10T16:45:59Z"), // 18:45:59 a Roma
    );
    expect(result).toEqual({ placed: 4, unplaced: 0 });
    for (const m of byRound(id, 2))
      expect(m.scheduled_at).toBe("2026-08-10T19:30");
  });

  it("non usa slot già passati e conta onestamente ciò che resta fuori", () => {
    const id = tournamentWithSchedule("Ritardo");
    for (const round of [2, 3])
      for (const m of byRound(id, round)) repo.scheduleMatch(m.id, null, null);

    // Sono le 20:10 di Roma: resta libero il solo slot delle 20:15.
    const { placed, unplaced } = repo.fillScheduleGaps(
      id,
      romeClock("2026-08-10T18:10:00Z"),
    );
    expect({ placed, unplaced }).toEqual({ placed: 2, unplaced: 2 });

    for (const m of byRound(id, 2)) expect(m.scheduled_at).toBe("2026-08-10T20:15");
    // Le partite senza posto restano senza orario: nessun ripiego nel passato.
    for (const m of byRound(id, 3)) expect(m.scheduled_at).toBeNull();
    for (const m of repo.listMatches(id))
      if (m.scheduled_at !== null && m.round > 1)
        expect(m.scheduled_at > "2026-08-10T20:10").toBe(true);
  });

  it("a giornate finite non programma nulla invece di forzare gli orari", () => {
    const id = tournamentWithSchedule("Finito");
    for (const m of byRound(id, 3)) repo.scheduleMatch(m.id, null, null);

    const { placed, unplaced } = repo.fillScheduleGaps(
      id,
      romeClock("2026-08-11T10:00:00Z"), // giorno dopo l'unica giornata
    );
    expect({ placed, unplaced }).toEqual({ placed: 0, unplaced: 2 });
    for (const m of byRound(id, 3)) expect(m.scheduled_at).toBeNull();
  });

  it("non fa nulla se il calendario è già completo", () => {
    const id = tournamentWithSchedule("Completo");
    const before = repo.listMatches(id).map((m) => m.scheduled_at);
    expect(
      repo.fillScheduleGaps(id, romeClock("2026-08-10T16:00:00Z")),
    ).toEqual({ placed: 0, unplaced: 0 });
    expect(repo.listMatches(id).map((m) => m.scheduled_at)).toEqual(before);
  });

  it("chiede giornate e campi con un messaggio esplicito", () => {
    const id = repo.createTournament({
      name: "Senza Giornate",
      year: 2026,
      teamSize: 4,
      format: "groups_only",
      bestOf: 3,
      pointsPerSet: 21,
      pointsLastSet: 15,
      advancePerGroup: 2,
      matchMinutes: 40,
    });
    expect(() => repo.fillScheduleGaps(id)).toThrow(/giornata/);
    repo.addDay(id, "2026-08-10", "18:00", "21:20");
    expect(() => repo.fillScheduleGaps(id)).toThrow(/campo/);
    expect(() => repo.fillScheduleGaps(999999)).toThrow(/Torneo non trovato/);
  });
});
