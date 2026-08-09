// ABOUTME: Test dello scheduler: capienza per giornata, blocchi paralleli sui campi,
// ABOUTME: rotazione dei campi, sforo sul giorno dopo, capienza, riposo e finestra utile

import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  daysAfter,
  isAdjacentSlot,
  type Assignment,
  type DaySlot,
  type ScheduleBlock,
  type TeamsByMatch,
} from "../scheduler";
import { roundRobin } from "../roundRobin";

const days: DaySlot[] = [
  { date: "2026-08-10", startTime: "18:00", endTime: "20:30" },
  { date: "2026-08-11", startTime: "18:00", endTime: "20:30" },
  { date: "2026-08-12", startTime: "17:00", endTime: "20:20" },
];
const courts = ["Campo 1", "Campo 2"];

/** Nessuna membership: lo scheduler non ha vincoli di riposo da rispettare. */
const noTeams: TeamsByMatch = new Map();

describe("buildSchedule", () => {
  it("un blocco entro il numero di campi occupa un solo slot", () => {
    const { assignments } = buildSchedule(
      days,
      courts,
      40,
      [{ matchIds: [1, 2] }, { matchIds: [3, 4] }],
      noTeams,
    );
    const byMatch = new Map(assignments.map((a) => [a.matchId, a]));
    expect(byMatch.get(1)!.scheduledAt).toBe("2026-08-10T18:00");
    expect(byMatch.get(2)!.scheduledAt).toBe("2026-08-10T18:00");
    expect(byMatch.get(1)!.court).not.toBe(byMatch.get(2)!.court);
    expect(byMatch.get(3)!.scheduledAt).toBe("2026-08-10T18:40");
  });

  it("mai due partite sullo stesso campo nello stesso orario", () => {
    const blocks = Array.from({ length: 5 }, (_, i) => ({
      matchIds: [i * 3 + 1, i * 3 + 2, i * 3 + 3],
    }));
    const { assignments } = buildSchedule(days, courts, 40, blocks, noTeams);
    const seen = new Set<string>();
    for (const a of assignments) {
      const key = `${a.scheduledAt}|${a.court}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("un blocco più grande dei campi usa slot consecutivi", () => {
    const { assignments } = buildSchedule(
      days,
      courts,
      40,
      [{ matchIds: [1, 2, 3, 4] }],
      noTeams,
    );
    const times = [...new Set(assignments.map((a) => a.scheduledAt))].sort();
    expect(times).toEqual(["2026-08-10T18:00", "2026-08-10T18:40"]);
  });

  it("sfora sulla giornata successiva quando la prima è piena", () => {
    // 18:00-20:30 con partite da 40' = 3 slot; 4 blocchi da 2 → il 4° va all'11
    const blocks = Array.from({ length: 4 }, (_, i) => ({
      matchIds: [i * 2 + 1, i * 2 + 2],
    }));
    const { assignments } = buildSchedule(days, courts, 40, blocks, noTeams);
    const lastBlock = assignments.filter((a) => a.matchId >= 7);
    expect(lastBlock.every((a) => a.scheduledAt.startsWith("2026-08-11T18:00"))).toBe(
      true,
    );
  });

  it("gli orari stimati restano dentro la finestra della giornata", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({ matchIds: [i + 1] }));
    const { assignments } = buildSchedule(days, courts, 40, blocks, noTeams);
    for (const a of assignments) {
      const [date, time] = a.scheduledAt.split("T");
      const day = days.find((d) => d.date === date)!;
      expect(time >= day.startTime).toBe(true);
      expect(time < day.endTime).toBe(true);
    }
  });

  it("bilancia il carico tra i campi", () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({ matchIds: [i + 1] }));
    const { assignments } = buildSchedule(days, courts, 40, blocks, noTeams);
    const perCourt = new Map<string, number>();
    for (const a of assignments)
      perCourt.set(a.court, (perCourt.get(a.court) ?? 0) + 1);
    const counts = [...perCourt.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("segnala le partite che non ci stanno, compresi i blocchi successivi", () => {
    const oneDay: DaySlot[] = [
      { date: "2026-08-10", startTime: "18:00", endTime: "19:20" }, // 2 slot
    ];
    const { assignments, unplacedMatchIds } = buildSchedule(
      oneDay,
      ["Campo 1"],
      40,
      [{ matchIds: [1, 2] }, { matchIds: [3] }, { matchIds: [4] }],
      noTeams,
    );
    expect(assignments.map((a) => a.matchId)).toEqual([1, 2]);
    expect(unplacedMatchIds.sort()).toEqual([3, 4]);
  });

  it("rifiuta input senza giornate, senza campi o con durata assurda", () => {
    expect(() => buildSchedule([], courts, 40, [], noTeams)).toThrow(/giornata/);
    expect(() => buildSchedule(days, [], 40, [], noTeams)).toThrow(/campo/);
    expect(() => buildSchedule(days, courts, 5, [], noTeams)).toThrow(/durata/);
  });
});

// ---------------------------------------------------------------------------
// Riposo tra le partite
// ---------------------------------------------------------------------------

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Un girone all'italiana come lo costruisce il repo: un blocco per round,
 * partite numerate progressivamente, membership squadra per partita.
 */
function groupBlocks(
  teamIds: number[],
  firstMatchId: number,
): { blocks: ScheduleBlock[]; teamsByMatch: TeamsByMatch } {
  const byRound = new Map<number, number[]>();
  const teamsByMatch: TeamsByMatch = new Map();
  roundRobin(teamIds).forEach((m, i) => {
    const matchId = firstMatchId + i;
    teamsByMatch.set(matchId, [m.a, m.b]);
    byRound.set(m.round, [...(byRound.get(m.round) ?? []), matchId]);
  });
  const blocks = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, matchIds]) => ({ matchIds }));
  return { blocks, teamsByMatch };
}

/** Unisce più gironi: i round omologhi finiscono nello stesso blocco. */
function mergeGroups(
  parts: Array<{ blocks: ScheduleBlock[]; teamsByMatch: TeamsByMatch }>,
): { blocks: ScheduleBlock[]; teamsByMatch: TeamsByMatch } {
  const rounds = Math.max(...parts.map((p) => p.blocks.length));
  const blocks = Array.from({ length: rounds }, (_, r) => ({
    matchIds: parts.flatMap((p) => p.blocks[r]?.matchIds ?? []),
  }));
  const teamsByMatch: TeamsByMatch = new Map();
  for (const p of parts)
    for (const [matchId, teams] of p.teamsByMatch) teamsByMatch.set(matchId, teams);
  return { blocks, teamsByMatch };
}

/** Squadre che giocano due slot attaccati (stessa giornata, orari adiacenti). */
function backToBack(
  assignments: Assignment[],
  teamsByMatch: TeamsByMatch,
  matchMinutes: number,
): string[] {
  const timesByTeam = new Map<number, string[]>();
  for (const a of assignments)
    for (const teamId of teamsByMatch.get(a.matchId) ?? [])
      timesByTeam.set(teamId, [...(timesByTeam.get(teamId) ?? []), a.scheduledAt]);

  const found: string[] = [];
  for (const [teamId, times] of timesByTeam) {
    // Le stringhe sono zero-padded: l'ordinamento lessicale è cronologico.
    const sorted = [...times].sort();
    for (let i = 1; i < sorted.length; i++) {
      const [prevDate, prevTime] = sorted[i - 1].split("T");
      const [date, time] = sorted[i].split("T");
      if (prevDate === date && toMinutes(time) - toMinutes(prevTime) === matchMinutes)
        found.push(`squadra ${teamId}: ${sorted[i - 1]} → ${sorted[i]}`);
    }
  }
  return found;
}

describe("buildSchedule: riposo tra le partite", () => {
  it("con capienza larga nessuna squadra gioca due slot attaccati", () => {
    // 6 squadre in 2 gironi da 3 (come generateGroups), 3 giorni × 2 campi.
    const { blocks, teamsByMatch } = mergeGroups([
      groupBlocks([1, 2, 3], 1),
      groupBlocks([4, 5, 6], 10),
    ]);
    const { assignments, unplacedMatchIds } = buildSchedule(
      days,
      courts,
      40,
      blocks,
      teamsByMatch,
    );
    expect(unplacedMatchIds).toEqual([]);
    expect(backToBack(assignments, teamsByMatch, 40)).toEqual([]);
    // La stessa configurazione senza membership (il comportamento di prima)
    // incolla i round: senza questo controllo il test sopra sarebbe vuoto.
    const senzaRiposo = buildSchedule(days, courts, 40, blocks, noTeams);
    expect(
      backToBack(senzaRiposo.assignments, teamsByMatch, 40).length,
    ).toBeGreaterThan(0);
  });

  it("il riposo non sposta una squadra dentro lo slot di un'altra sua partita", () => {
    const { blocks, teamsByMatch } = mergeGroups([
      groupBlocks([1, 2, 3, 4], 1),
      groupBlocks([5, 6, 7, 8], 20),
    ]);
    const { assignments } = buildSchedule(days, courts, 40, blocks, teamsByMatch);
    const seen = new Set<string>();
    for (const a of assignments)
      for (const teamId of teamsByMatch.get(a.matchId) ?? []) {
        const key = `${a.scheduledAt}|${teamId}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
  });

  it("con capienza stretta piazza le stesse partite di prima del riposo", () => {
    const oneDay: DaySlot[] = [
      { date: "2026-08-10", startTime: "18:00", endTime: "20:00" }, // 3 slot
    ];
    const { blocks, teamsByMatch } = groupBlocks([1, 2, 3, 4], 1); // 6 partite
    const conRiposo = buildSchedule(oneDay, ["Unico"], 40, blocks, teamsByMatch);
    const senzaRiposo = buildSchedule(oneDay, ["Unico"], 40, blocks, noTeams);
    expect(conRiposo.assignments).toHaveLength(senzaRiposo.assignments.length);
    expect(conRiposo.unplacedMatchIds).toHaveLength(
      senzaRiposo.unplacedMatchIds.length,
    );
    expect(conRiposo.assignments.length).toBe(3);
  });

  it("non inserisce cuscinetti quando servono tutti gli slot", () => {
    // 3 round da 2 partite su 2 campi = 3 slot esatti: nessuno slot di scorta.
    const oneDay: DaySlot[] = [
      { date: "2026-08-10", startTime: "18:00", endTime: "20:00" },
    ];
    const { blocks, teamsByMatch } = mergeGroups([
      groupBlocks([1, 2, 3], 1),
      groupBlocks([4, 5, 6], 10),
    ]);
    const { assignments, unplacedMatchIds } = buildSchedule(
      oneDay,
      courts,
      40,
      blocks,
      teamsByMatch,
    );
    expect(unplacedMatchIds).toEqual([]);
    expect(assignments).toHaveLength(6);
    // Il riposo cede: meglio tutte le partite in calendario che una fuori.
    expect(backToBack(assignments, teamsByMatch, 40).length).toBeGreaterThan(0);
  });

  it("le partite senza squadre note non generano vincoli di riposo", () => {
    // Round di tabellone non ancora propagati: team_a/team_b sono NULL.
    const teamsByMatch: TeamsByMatch = new Map([
      [1, [1, 2]],
      [2, [3, 4]],
    ]);
    const { assignments } = buildSchedule(
      days,
      courts,
      40,
      [{ matchIds: [1, 2] }, { matchIds: [3, 4] }],
      teamsByMatch,
    );
    const byMatch = new Map(assignments.map((a) => [a.matchId, a]));
    expect(byMatch.get(3)!.scheduledAt).toBe("2026-08-10T18:40");
  });

  it("su pool casuali non perde partite e non peggiora il riposo", () => {
    // LCG deterministico: stessi pool a ogni run, niente flakiness.
    const lcg = (seed: number) => {
      let s = seed;
      return () => (s = (s * 48271) % 2147483647) / 2147483647;
    };
    for (let seed = 1; seed <= 120; seed++) {
      const rnd = lcg(seed);
      const teamCount = 4 + Math.floor(rnd() * 5); // 4..8 squadre
      const groups = 1 + Math.floor(rnd() * 2);
      const parts = [];
      let nextId = 1;
      for (let g = 0; g < groups; g++) {
        const size = Math.max(2, Math.floor(teamCount / groups));
        const teamIds = Array.from({ length: size }, (_, i) => g * 100 + i + 1);
        parts.push(groupBlocks(teamIds, nextId));
        nextId += 1000;
      }
      const { blocks, teamsByMatch } = mergeGroups(parts);

      const courtCount = 1 + Math.floor(rnd() * 3); // 1..3 campi
      const poolCourts = Array.from({ length: courtCount }, (_, i) => `C${i + 1}`);
      const dayCount = 1 + Math.floor(rnd() * 3); // 1..3 giornate
      const minutes = [30, 40, 60][Math.floor(rnd() * 3)];
      const poolDays: DaySlot[] = Array.from({ length: dayCount }, (_, d) => ({
        date: `2026-08-${String(10 + d).padStart(2, "0")}`,
        startTime: "18:00",
        endTime: `${18 + 1 + Math.floor(rnd() * 4)}:00`, // finestre da 1 a 4 ore
      }));

      const conRiposo = buildSchedule(
        poolDays,
        poolCourts,
        minutes,
        blocks,
        teamsByMatch,
      );
      const senzaRiposo = buildSchedule(
        poolDays,
        poolCourts,
        minutes,
        blocks,
        noTeams,
      );
      const context = `seed ${seed}`;

      // (a) mai una squadra in due partite dello stesso slot
      const seen = new Set<string>();
      for (const a of conRiposo.assignments)
        for (const teamId of teamsByMatch.get(a.matchId) ?? []) {
          const key = `${a.scheduledAt}|${teamId}`;
          expect(seen.has(key), context).toBe(false);
          seen.add(key);
        }
      // (b) mai due partite sullo stesso campo alla stessa ora
      const slotKeys = new Set<string>();
      for (const a of conRiposo.assignments) {
        const key = `${a.scheduledAt}|${a.court}`;
        expect(slotKeys.has(key), context).toBe(false);
        slotKeys.add(key);
      }
      // (c) il riposo non costa mai una partita
      expect(conRiposo.assignments.length, context).toBe(
        senzaRiposo.assignments.length,
      );
      // (d) e non peggiora mai i back-to-back
      expect(
        backToBack(conRiposo.assignments, teamsByMatch, minutes).length,
        context,
      ).toBeLessThanOrEqual(
        backToBack(senzaRiposo.assignments, teamsByMatch, minutes).length,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Finestra utilizzabile (calendario completato a torneo iniziato)
// ---------------------------------------------------------------------------

describe("daysAfter", () => {
  it("taglia le giornate consumate e fa ripartire quella in corso", () => {
    // 18:00-20:30 con slot da 40': 18:00, 18:40, 19:20, 20:00
    const kept = daysAfter(days, 40, "2026-08-10T18:40");
    expect(kept.map((d) => `${d.date} ${d.startTime}`)).toEqual([
      "2026-08-10 19:20",
      "2026-08-11 18:00",
      "2026-08-12 17:00",
    ]);
  });

  it("resta sulla griglia originale, così gli orari non slittano", () => {
    // Un istante a metà slot non sposta la griglia: si riparte da quello dopo.
    const kept = daysAfter(days, 40, "2026-08-10T18:55");
    const { assignments } = buildSchedule(
      kept,
      courts,
      40,
      [{ matchIds: [1] }],
      noTeams,
    );
    expect(assignments[0].scheduledAt).toBe("2026-08-10T19:20");
  });

  it("scarta le giornate del tutto passate e non ne inventa di nuove", () => {
    expect(daysAfter(days, 40, "2026-08-11T20:00").map((d) => d.date)).toEqual([
      "2026-08-12",
    ]);
    expect(daysAfter(days, 40, "2026-08-12T23:59")).toEqual([]);
    expect(daysAfter([], 40, "2026-08-10T18:00")).toEqual([]);
  });

  it("tiene tutta la giornata quando il taglio precede il suo inizio", () => {
    expect(daysAfter(days, 40, "2026-08-10T09:00")[0]).toEqual(days[0]);
  });

  it("rifiuta una durata partita assurda invece di ciclare a vuoto", () => {
    expect(() => daysAfter(days, 0, "2026-08-10T18:00")).toThrow(/durata/);
  });
});

describe("isAdjacentSlot", () => {
  it("vale solo a parità di giornata e a esattamente uno slot di distanza", () => {
    expect(isAdjacentSlot("2026-08-10T18:00", "2026-08-10T18:40", 40)).toBe(true);
    expect(isAdjacentSlot("2026-08-10T18:00", "2026-08-10T19:20", 40)).toBe(false);
    expect(isAdjacentSlot("2026-08-10T20:00", "2026-08-11T18:00", 40)).toBe(false);
  });
});

describe("buildSchedule: riposo oltre il bordo della generazione", () => {
  const teamsByMatch: TeamsByMatch = new Map([
    [1, [1, 2]],
    [2, [3, 4]],
  ]);

  it("non rimanda in campo chi ha giocato nello slot precedente", () => {
    const oneDay: DaySlot[] = [
      { date: "2026-08-10", startTime: "19:20", endTime: "21:20" }, // 3 slot
    ];
    const { assignments } = buildSchedule(
      oneDay,
      ["Campo 1"],
      40,
      [{ matchIds: [1] }, { matchIds: [2] }],
      teamsByMatch,
      new Set([1, 2]), // 1 e 2 hanno giocato nello slot delle 18:40
    );
    const byMatch = new Map(assignments.map((a) => [a.matchId, a.scheduledAt]));
    expect(byMatch.get(1)).toBe("2026-08-10T20:00"); // cuscinetto: 19:20 saltato
    expect(byMatch.get(2)).toBe("2026-08-10T20:40");
  });

  it("rinuncia al cuscinetto se costerebbe una partita", () => {
    const oneDay: DaySlot[] = [
      { date: "2026-08-10", startTime: "19:20", endTime: "20:40" }, // 2 slot
    ];
    const { assignments, unplacedMatchIds } = buildSchedule(
      oneDay,
      ["Campo 1"],
      40,
      [{ matchIds: [1] }, { matchIds: [2] }],
      teamsByMatch,
      new Set([1, 2]),
    );
    expect(unplacedMatchIds).toEqual([]);
    expect(assignments.map((a) => a.scheduledAt)).toEqual([
      "2026-08-10T19:20",
      "2026-08-10T20:00",
    ]);
  });

  it("riordina il blocco invece di sprecare uno slot, quando può", () => {
    const oneDay: DaySlot[] = [
      { date: "2026-08-10", startTime: "19:20", endTime: "21:20" },
    ];
    const mixed: TeamsByMatch = new Map([
      [1, [1, 2]], // hanno appena giocato
      [2, [5, 6]], // riposate
    ]);
    const { assignments } = buildSchedule(
      oneDay,
      ["Campo 1"],
      40,
      [{ matchIds: [1, 2] }],
      mixed,
      new Set([1, 2]),
    );
    const byMatch = new Map(assignments.map((a) => [a.matchId, a.scheduledAt]));
    expect(byMatch.get(2)).toBe("2026-08-10T19:20");
    expect(byMatch.get(1)).toBe("2026-08-10T20:00");
  });
});
