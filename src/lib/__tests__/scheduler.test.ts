// ABOUTME: Test dello scheduler: capienza per giornata, blocchi paralleli sui campi,
// ABOUTME: rotazione dei campi, sforo sul giorno dopo e capienza insufficiente

import { describe, expect, it } from "vitest";
import { buildSchedule, type DaySlot } from "../scheduler";

const days: DaySlot[] = [
  { date: "2026-08-10", startTime: "18:00", endTime: "20:30" },
  { date: "2026-08-11", startTime: "18:00", endTime: "20:30" },
  { date: "2026-08-12", startTime: "17:00", endTime: "20:20" },
];
const courts = ["Campo 1", "Campo 2"];

describe("buildSchedule", () => {
  it("un blocco entro il numero di campi occupa un solo slot", () => {
    const { assignments } = buildSchedule(days, courts, 40, [
      { matchIds: [1, 2] },
      { matchIds: [3, 4] },
    ]);
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
    const { assignments } = buildSchedule(days, courts, 40, blocks);
    const seen = new Set<string>();
    for (const a of assignments) {
      const key = `${a.scheduledAt}|${a.court}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("un blocco più grande dei campi usa slot consecutivi", () => {
    const { assignments } = buildSchedule(days, courts, 40, [
      { matchIds: [1, 2, 3, 4] },
    ]);
    const times = [...new Set(assignments.map((a) => a.scheduledAt))].sort();
    expect(times).toEqual(["2026-08-10T18:00", "2026-08-10T18:40"]);
  });

  it("sfora sulla giornata successiva quando la prima è piena", () => {
    // 18:00-20:30 con partite da 40' = 3 slot; 4 blocchi da 2 → il 4° va all'11
    const blocks = Array.from({ length: 4 }, (_, i) => ({
      matchIds: [i * 2 + 1, i * 2 + 2],
    }));
    const { assignments } = buildSchedule(days, courts, 40, blocks);
    const lastBlock = assignments.filter((a) => a.matchId >= 7);
    expect(lastBlock.every((a) => a.scheduledAt.startsWith("2026-08-11T18:00"))).toBe(
      true,
    );
  });

  it("gli orari stimati restano dentro la finestra della giornata", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({ matchIds: [i + 1] }));
    const { assignments } = buildSchedule(days, courts, 40, blocks);
    for (const a of assignments) {
      const [date, time] = a.scheduledAt.split("T");
      const day = days.find((d) => d.date === date)!;
      expect(time >= day.startTime).toBe(true);
      expect(time < day.endTime).toBe(true);
    }
  });

  it("bilancia il carico tra i campi", () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({ matchIds: [i + 1] }));
    const { assignments } = buildSchedule(days, courts, 40, blocks);
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
    const { assignments, unplacedMatchIds } = buildSchedule(oneDay, ["Campo 1"], 40, [
      { matchIds: [1, 2] },
      { matchIds: [3] },
      { matchIds: [4] },
    ]);
    expect(assignments.map((a) => a.matchId)).toEqual([1, 2]);
    expect(unplacedMatchIds.sort()).toEqual([3, 4]);
  });

  it("rifiuta input senza giornate, senza campi o con durata assurda", () => {
    expect(() => buildSchedule([], courts, 40, [])).toThrow(/giornata/);
    expect(() => buildSchedule(days, [], 40, [])).toThrow(/campo/);
    expect(() => buildSchedule(days, courts, 5, [])).toThrow(/durata/);
  });
});
