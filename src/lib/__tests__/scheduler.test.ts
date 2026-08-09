// ABOUTME: Test dello scheduler con durata partita e pausa fissa di 5 minuti
// ABOUTME: copre griglia, campi, capienza, round, finestre residue e validazione

import { describe, expect, it } from "vitest";
import {
  availableDaysFrom,
  buildSchedule,
  MATCH_BREAK_MINUTES,
  matchIntervalMinutes,
  nextMatchStart,
  type DaySlot,
  type ScheduleBlock,
} from "../scheduler";
import { roundRobin } from "../roundRobin";

const days: DaySlot[] = [
  { date: "2026-08-10", startTime: "18:00", endTime: "20:30" },
  { date: "2026-08-11", startTime: "18:00", endTime: "20:30" },
  { date: "2026-08-12", startTime: "17:00", endTime: "20:20" },
];
const courts = ["Campo 1", "Campo 2"];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Un girone all'italiana come lo costruisce il repository: un blocco per round. */
function groupBlocks(teamIds: number[], firstMatchId = 1): ScheduleBlock[] {
  const byRound = new Map<number, number[]>();
  roundRobin(teamIds).forEach((match, index) => {
    const matchId = firstMatchId + index;
    byRound.set(match.round, [
      ...(byRound.get(match.round) ?? []),
      matchId,
    ]);
  });
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, matchIds]) => ({ matchIds }));
}

describe("buildSchedule", () => {
  it("aggiunge 5 minuti tra due inizi consecutivi", () => {
    expect(MATCH_BREAK_MINUTES).toBe(5);
    expect(matchIntervalMinutes(40)).toBe(45);

    const { assignments } = buildSchedule(days, courts, 40, [
      { matchIds: [1, 2] },
      { matchIds: [3, 4] },
      { matchIds: [5, 6] },
    ]);
    const byMatch = new Map(assignments.map((a) => [a.matchId, a]));
    expect(byMatch.get(1)!.scheduledAt).toBe("2026-08-10T18:00");
    expect(byMatch.get(2)!.scheduledAt).toBe("2026-08-10T18:00");
    expect(byMatch.get(1)!.court).not.toBe(byMatch.get(2)!.court);
    expect(byMatch.get(3)!.scheduledAt).toBe("2026-08-10T18:45");
    expect(byMatch.get(5)!.scheduledAt).toBe("2026-08-10T19:30");
  });

  it("un blocco più grande dei campi usa slot consecutivi da 45 minuti", () => {
    const { assignments } = buildSchedule(days, courts, 40, [
      { matchIds: [1, 2, 3, 4] },
    ]);
    const times = [...new Set(assignments.map((a) => a.scheduledAt))].sort();
    expect(times).toEqual(["2026-08-10T18:00", "2026-08-10T18:45"]);
  });

  it("mai due partite sullo stesso campo nello stesso orario", () => {
    const blocks = Array.from({ length: 5 }, (_, i) => ({
      matchIds: [i * 3 + 1, i * 3 + 2, i * 3 + 3],
    }));
    const { assignments } = buildSchedule(days, courts, 40, blocks);
    const seen = new Set<string>();
    for (const assignment of assignments) {
      const key = `${assignment.scheduledAt}|${assignment.court}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("mantiene i round in ordine e consente 5 minuti prima di rigiocare", () => {
    const blocks = groupBlocks([1, 2, 3, 4]);
    const { assignments, unplacedMatchIds } = buildSchedule(
      days,
      courts,
      40,
      blocks,
    );
    expect(unplacedMatchIds).toEqual([]);
    expect([...new Set(assignments.map((a) => a.scheduledAt))]).toEqual([
      "2026-08-10T18:00",
      "2026-08-10T18:45",
      "2026-08-10T19:30",
    ]);
  });

  it("sfora sulla giornata successiva quando la prima è piena", () => {
    // 18:00-20:30 contiene 3 partite da 40' + pausa; il 4° blocco va all'11.
    const blocks = Array.from({ length: 4 }, (_, i) => ({
      matchIds: [i * 2 + 1, i * 2 + 2],
    }));
    const { assignments, slotsPerDay } = buildSchedule(
      days,
      courts,
      40,
      blocks,
    );
    expect(slotsPerDay[0]).toEqual({ date: "2026-08-10", slots: 3 });
    const lastBlock = assignments.filter((a) => a.matchId >= 7);
    expect(
      lastBlock.every((a) => a.scheduledAt === "2026-08-11T18:00"),
    ).toBe(true);
  });

  it("ogni partita finisce entro la finestra della giornata", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({ matchIds: [i + 1] }));
    const { assignments } = buildSchedule(days, courts, 40, blocks);
    for (const assignment of assignments) {
      const [date, time] = assignment.scheduledAt.split("T");
      const day = days.find((candidate) => candidate.date === date)!;
      expect(toMinutes(time) + 40).toBeLessThanOrEqual(
        toMinutes(day.endTime),
      );
    }
  });

  it("bilancia il carico tra i campi", () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({ matchIds: [i + 1] }));
    const { assignments } = buildSchedule(days, courts, 40, blocks);
    const perCourt = new Map<string, number>();
    for (const assignment of assignments)
      perCourt.set(
        assignment.court,
        (perCourt.get(assignment.court) ?? 0) + 1,
      );
    const counts = [...perCourt.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("segnala le partite che non ci stanno, compresi i blocchi successivi", () => {
    const oneDay: DaySlot[] = [
      { date: "2026-08-10", startTime: "18:00", endTime: "19:20" },
    ];
    const { assignments, unplacedMatchIds } = buildSchedule(
      oneDay,
      ["Campo 1"],
      40,
      [{ matchIds: [1, 2] }, { matchIds: [3] }, { matchIds: [4] }],
    );
    expect(assignments.map((a) => a.matchId)).toEqual([1]);
    expect(unplacedMatchIds.sort()).toEqual([2, 3, 4]);
  });

  it("su pool deterministici non duplica né perde identificativi", () => {
    const lcg = (seed: number) => {
      let state = seed;
      return () =>
        (state = (state * 48271) % 2147483647) / 2147483647;
    };

    for (let seed = 1; seed <= 120; seed++) {
      const random = lcg(seed);
      let nextId = 1;
      const blocks = Array.from(
        { length: 1 + Math.floor(random() * 6) },
        () => ({
          matchIds: Array.from(
            { length: 1 + Math.floor(random() * 4) },
            () => nextId++,
          ),
        }),
      );
      const poolCourts = Array.from(
        { length: 1 + Math.floor(random() * 3) },
        (_, index) => `C${index + 1}`,
      );
      const poolDays: DaySlot[] = Array.from(
        { length: 1 + Math.floor(random() * 3) },
        (_, index) => ({
          date: `2026-08-${String(10 + index).padStart(2, "0")}`,
          startTime: "18:00",
          endTime: `${19 + Math.floor(random() * 4)}:00`,
        }),
      );
      const minutes = [30, 40, 60][Math.floor(random() * 3)];
      const result = buildSchedule(
        poolDays,
        poolCourts,
        minutes,
        blocks,
      );
      const expected = blocks.flatMap((block) => block.matchIds).sort();
      const actual = [
        ...result.assignments.map((assignment) => assignment.matchId),
        ...result.unplacedMatchIds,
      ].sort();
      expect(actual, `seed ${seed}`).toEqual(expected);
      expect(new Set(actual).size, `seed ${seed}`).toBe(actual.length);

      const fieldSlots = result.assignments.map(
        (assignment) => `${assignment.scheduledAt}|${assignment.court}`,
      );
      expect(new Set(fieldSlots).size, `seed ${seed}`).toBe(fieldSlots.length);
    }
  });

  it("rifiuta input senza giornate, senza campi o con durata assurda", () => {
    expect(() => buildSchedule([], courts, 40, [])).toThrow(/giornata/);
    expect(() => buildSchedule(days, [], 40, [])).toThrow(/campo/);
    expect(() => buildSchedule(days, courts, 5, [])).toThrow(/durata/);
  });
});

describe("availableDaysFrom", () => {
  it("resta sulla griglia partita + pausa e include il limite esatto", () => {
    const atSlot = availableDaysFrom(days, 40, "2026-08-10T18:45");
    expect(atSlot.map((d) => `${d.date} ${d.startTime}`)).toEqual([
      "2026-08-10 18:45",
      "2026-08-11 18:00",
      "2026-08-12 17:00",
    ]);

    const betweenSlots = availableDaysFrom(days, 40, "2026-08-10T18:46");
    expect(betweenSlots[0].startTime).toBe("19:30");
  });

  it("scarta le giornate consumate e non ne inventa di nuove", () => {
    expect(
      availableDaysFrom(days, 40, "2026-08-11T20:00").map((d) => d.date),
    ).toEqual(["2026-08-12"]);
    expect(availableDaysFrom(days, 40, "2026-08-12T23:59")).toEqual([]);
    expect(availableDaysFrom([], 40, "2026-08-10T18:00")).toEqual([]);
  });

  it("tiene tutta la giornata quando il limite precede il suo inizio", () => {
    expect(availableDaysFrom(days, 40, "2026-08-10T09:00")[0]).toEqual(
      days[0],
    );
  });

  it("rifiuta una durata partita assurda", () => {
    expect(() => availableDaysFrom(days, 0, "2026-08-10T18:00")).toThrow(
      /durata/,
    );
  });
});

describe("nextMatchStart", () => {
  it("somma durata e pausa anche oltre la mezzanotte", () => {
    expect(nextMatchStart("2026-08-10T18:00", 40)).toBe(
      "2026-08-10T18:45",
    );
    expect(nextMatchStart("2026-08-10T23:30", 40)).toBe(
      "2026-08-11T00:15",
    );
  });
});
