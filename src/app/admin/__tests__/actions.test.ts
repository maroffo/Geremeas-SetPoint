// ABOUTME: Test del mapping ruolo→azione: il segnapunti registra i punteggi ma non gestisce il torneo.
// ABOUTME: Le server action girano davvero (repo su DB temporaneo), con redirect e cookie finti.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-actions-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const { fakeStore, fakeHeaders } = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    fakeStore: {
      data,
      get(name: string) {
        const value = data.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set(name: string, value: string) {
        data.set(name, value);
      },
      delete(name: string) {
        data.delete(name);
      },
    },
    fakeHeaders: { get: () => "10.1.2.3" },
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => fakeStore),
  headers: vi.fn(async () => fakeHeaders),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// In Next `redirect()` interrompe l'esecuzione lanciando: senza questo le
// guardie ridirigerebbero e l'azione proseguirebbe lo stesso.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(url), { name: "REDIRECT" });
  },
}));

const actions = await import("../actions");
const auth = await import("@/lib/auth");
const repo = await import("@/lib/repo");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

const ADMIN_PIN = "segretissimo";
const SCORE_PIN = "punti-a1b2";

beforeEach(() => {
  fakeStore.data.clear();
  vi.stubEnv("ADMIN_PIN", ADMIN_PIN);
  vi.stubEnv("SCOREKEEPER_PIN", SCORE_PIN);
});

/** Esegue l'azione e restituisce la destinazione del redirect finale. */
async function redirectOf(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (e) {
    if (e instanceof Error && e.name === "REDIRECT") return e.message;
    throw e;
  }
  throw new Error("l'azione è terminata senza redirect");
}

async function loginAs(role: "admin" | "scorekeeper"): Promise<void> {
  const pin = role === "admin" ? ADMIN_PIN : SCORE_PIN;
  expect(await auth.loginAdmin(pin)).toBe(role);
}

function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, String(v));
  return data;
}

let counter = 0;

/** Torneo a eliminazione con 4 squadre: due semifinali pronte da giocare. */
function setupMatch(): number {
  const tournamentId = repo.createTournament({
    name: `Torneo ruoli ${++counter}`,
    year: 2026,
    teamSize: 4,
    format: "knockout_only",
    bestOf: 3,
    pointsPerSet: 21,
    pointsLastSet: 15,
    advancePerGroup: 2,
  });
  for (let i = 1; i <= 4; i++) {
    const teamId = repo.registerTeam(tournamentId, `Squadra ${counter}-${i}`, `333000000${i}`, [
      { firstName: "Anna", lastName: "Rossi", gender: "F" as const },
      { firstName: "Bruno", lastName: "Bianchi", gender: "M" as const },
      { firstName: "Carlo", lastName: "Verdi", gender: "M" as const },
      { firstName: "Dario", lastName: "Neri", gender: "M" as const },
    ]);
    repo.setTeamStatus(teamId, "active");
  }
  repo.generateKnockout(tournamentId);
  return repo.listMatches(tournamentId).filter((m) => m.round === 1)[0].id;
}

/** Lo stesso torneo con una giornata e un campo, pronto per il calendario. */
function withDaysAndCourt(): number {
  const tournamentId = repo.getMatch(setupMatch())!.tournament_id;
  repo.addDay(tournamentId, "2099-08-10", "18:00", "21:20");
  repo.addCourt(tournamentId, "Campo 1");
  return tournamentId;
}

const twoZero = { set1a: 21, set1b: 10, set2a: 21, set2b: 12 };

describe("segnapunti", () => {
  it("salva un punteggio", async () => {
    const matchId = setupMatch();
    await loginAs("scorekeeper");

    const to = await redirectOf(
      actions.saveScoreAction(form({ matchId, ...twoZero, back: "/admin/partite" })),
    );

    expect(to).toBe("/admin/partite");
    expect(repo.getMatch(matchId)!.status).toBe("finished");
    expect(repo.getMatch(matchId)!.winner).not.toBeNull();
  });

  it("annulla un punteggio e assegna un forfait", async () => {
    const matchId = setupMatch();
    await loginAs("scorekeeper");

    await redirectOf(actions.saveScoreAction(form({ matchId, ...twoZero })));
    await redirectOf(actions.clearScoreAction(form({ matchId })));
    expect(repo.getMatch(matchId)!.status).toBe("scheduled");

    const teamId = repo.getMatch(matchId)!.team_a!;
    await redirectOf(actions.forfeitAction(form({ matchId, teamId })));
    expect(repo.getMatch(matchId)!.status).toBe("forfeit");
  });

  it("non può creare un torneo: viene rimandato alle partite", async () => {
    setupMatch();
    await loginAs("scorekeeper");
    // Il torneo attivo è l'ultimo creato: se l'azione passasse, cambierebbe.
    const before = repo.getActiveTournament()!.id;

    const to = await redirectOf(
      actions.createTournamentAction(form({ name: "Torneo abusivo", year: 2026 })),
    );

    expect(to).toBe("/admin/partite");
    expect(repo.getActiveTournament()!.id).toBe(before);
  });

  it("non può spostare una partita in calendario", async () => {
    const matchId = setupMatch();
    await loginAs("scorekeeper");

    const to = await redirectOf(
      actions.scheduleMatchAction(
        form({ matchId, court: "Campo 9", scheduledAt: "2026-08-10T18:00" }),
      ),
    );

    expect(to).toBe("/admin/partite");
    expect(repo.getMatch(matchId)!.court).toBeNull();
    expect(repo.getMatch(matchId)!.scheduled_at).toBeNull();
  });

  it("non può completare il calendario", async () => {
    const tournamentId = withDaysAndCourt();
    const matchId = repo.listMatches(tournamentId)[0].id;
    await loginAs("scorekeeper");

    const to = await redirectOf(
      actions.fillScheduleGapsAction(form({ tournamentId })),
    );

    expect(to).toBe("/admin/partite");
    expect(repo.getMatch(matchId)!.scheduled_at).toBeNull();
  });
});

describe("admin", () => {
  it("crea un torneo e salva un punteggio", async () => {
    const matchId = setupMatch();
    await loginAs("admin");
    const before = repo.getActiveTournament()!.id;

    expect(
      await redirectOf(
        actions.createTournamentAction(form({ name: "Torneo vero", year: 2026 })),
      ),
    ).toBe("/admin");
    const created = repo.getActiveTournament()!;
    expect(created.id).toBeGreaterThan(before);
    expect(created.name).toBe("Torneo vero");

    await redirectOf(actions.saveScoreAction(form({ matchId, ...twoZero })));
    expect(repo.getMatch(matchId)!.status).toBe("finished");
  });

  it("completa il calendario delle partite senza orario", async () => {
    const tournamentId = withDaysAndCourt();
    const matchId = repo.listMatches(tournamentId)[0].id;
    await loginAs("admin");

    const to = await redirectOf(
      actions.fillScheduleGapsAction(form({ tournamentId })),
    );

    expect(to).toBe("/admin/partite");
    expect(repo.getMatch(matchId)!.scheduled_at).toBe("2099-08-10T18:00");
  });
});

describe("senza sessione", () => {
  it("anche l'inserimento punteggi finisce al login", async () => {
    const matchId = setupMatch();

    const to = await redirectOf(actions.saveScoreAction(form({ matchId, ...twoZero })));

    expect(to).toBe("/admin/login");
    expect(repo.getMatch(matchId)!.status).toBe("scheduled");
  });
});
