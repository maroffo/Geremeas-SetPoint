// ABOUTME: Test dell'orologio di Roma: formato zero-padded confrontabile e
// ABOUTME: comportamento sui due cambi d'ora del 2026 (29 marzo e 25 ottobre)

import { describe, expect, it } from "vitest";
import { nowInRome, nowInRomeCeilMinute, todayInRome } from "../clock";

describe("nowInRome", () => {
  it("restituisce l'ora di parete di Roma zero-padded", () => {
    // 08:05 UTC in inverno (CET, +1) → 09:05 a Roma
    expect(nowInRome(new Date("2026-01-15T08:05:00Z"))).toBe("2026-01-15T09:05");
    // Mezzanotte: h23, mai "24"
    expect(nowInRome(new Date("2026-10-24T22:15:00Z"))).toBe("2026-10-25T00:15");
    expect(nowInRome(new Date("2026-01-15T08:05:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("segue il passaggio CET→CEST del 29 marzo 2026", () => {
    // Il cambio è alle 01:00 UTC: prima +1, subito dopo +2.
    expect(nowInRome(new Date("2026-03-29T00:30:00Z"))).toBe("2026-03-29T01:30");
    // Le 02:30 locali non esistono quel giorno: si salta alle 03:30.
    expect(nowInRome(new Date("2026-03-29T01:30:00Z"))).toBe("2026-03-29T03:30");
  });

  it("segue il passaggio CEST→CET del 25 ottobre 2026", () => {
    // Il cambio è alle 01:00 UTC: prima +2, subito dopo +1.
    expect(nowInRome(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25T02:30");
    expect(nowInRome(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-25T02:30");
    // L'ora ripetuta dà due volte la stessa stringa: è l'ora di parete, ed è
    // esattamente ciò con cui si confrontano gli orari salvati (anch'essi di
    // parete). L'ambiguità di quell'ora è del calendario civile, non del codice.
    expect(nowInRome(new Date("2026-10-25T00:30:00Z"))).toBe(
      nowInRome(new Date("2026-10-25T01:30:00Z")),
    );
  });

  it("ordina lessicalmente come ordina il tempo, anche attorno al DST", () => {
    const before = nowInRome(new Date("2026-10-25T00:10:00Z")); // 02:10 CEST
    const after = nowInRome(new Date("2026-10-25T01:40:00Z")); // 02:40 CET
    expect(before < after).toBe(true);
  });
});

describe("nowInRomeCeilMinute", () => {
  it("mantiene il minuto esatto e arrotonda in avanti i secondi", () => {
    expect(nowInRomeCeilMinute(new Date("2026-08-10T16:45:00Z"))).toBe(
      "2026-08-10T18:45",
    );
    expect(nowInRomeCeilMinute(new Date("2026-08-10T16:45:59Z"))).toBe(
      "2026-08-10T18:46",
    );
  });
});

describe("todayInRome", () => {
  it("è la data di Roma, non quella UTC", () => {
    // 23:05 UTC del 1° gennaio è già il 2 gennaio a Roma
    expect(todayInRome(new Date("2026-01-01T23:05:00Z"))).toBe("2026-01-02");
    expect(todayInRome(new Date("2026-08-10T16:00:00Z"))).toBe("2026-08-10");
  });
});
