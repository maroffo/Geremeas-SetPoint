"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin, requireAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import type { SetInput, TournamentFormat, TournamentStatus } from "@/lib/types";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Errore imprevisto";
}

function done(back: string, error: string | null): never {
  revalidatePath("/");
  redirect(error ? `${back}?error=${encodeURIComponent(error)}` : back);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData): Promise<void> {
  const pin = String(formData.get("pin") ?? "");
  const ok = await loginAdmin(pin);
  redirect(ok ? "/admin" : "/admin/login?error=PIN%20errato");
}

export async function logoutAction(): Promise<void> {
  await logoutAdmin();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Torneo
// ---------------------------------------------------------------------------

function optionalAge(formData: FormData, field: string): number | null {
  const raw = String(formData.get(field) ?? "").trim();
  return raw ? Number(raw) : null;
}

function settingsFromForm(formData: FormData): repo.TournamentSettings {
  return {
    name: String(formData.get("name") ?? "Torneo di Geremeas").trim(),
    year: Number(formData.get("year") ?? new Date().getFullYear()),
    teamSize: Number(formData.get("teamSize") ?? 4),
    format: String(formData.get("format") ?? "groups_knockout") as TournamentFormat,
    bestOf: Number(formData.get("bestOf") ?? 3),
    pointsPerSet: Number(formData.get("pointsPerSet") ?? 21),
    pointsLastSet: Number(formData.get("pointsLastSet") ?? 15),
    advancePerGroup: Number(formData.get("advancePerGroup") ?? 2),
    minAge: optionalAge(formData, "minAge"),
    maxAge: optionalAge(formData, "maxAge"),
  };
}

export async function createTournamentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let error: string | null = null;
  try {
    repo.createTournament(settingsFromForm(formData));
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

export async function updateTournamentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("tournamentId"));
  let error: string | null = null;
  try {
    repo.updateTournament(id, settingsFromForm(formData));
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

export async function setStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("tournamentId"));
  const status = String(formData.get("status")) as TournamentStatus;
  let error: string | null = null;
  try {
    repo.setTournamentStatus(id, status);
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

// ---------------------------------------------------------------------------
// Iscrizioni e squadre
// ---------------------------------------------------------------------------

export async function teamStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const teamId = Number(formData.get("teamId"));
  const status = String(formData.get("status")) as
    | "pending"
    | "active"
    | "withdrawn";
  let error: string | null = null;
  try {
    repo.setTeamStatus(teamId, status);
  } catch (e) {
    error = errorMessage(e);
  }
  done(String(formData.get("back") ?? "/admin/iscrizioni"), error);
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const teamId = Number(formData.get("teamId"));
  let error: string | null = null;
  try {
    repo.deleteTeam(teamId);
  } catch (e) {
    error = errorMessage(e);
  }
  done(String(formData.get("back") ?? "/admin/iscrizioni"), error);
}

export async function deletePlayerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const playerId = Number(formData.get("playerId"));
  let error: string | null = null;
  try {
    repo.deletePlayer(playerId);
  } catch (e) {
    error = errorMessage(e);
  }
  done(String(formData.get("back") ?? "/admin/iscrizioni"), error);
}

export async function generateTeamsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  let error: string | null = null;
  try {
    repo.generateTeamsFromSingles(tournamentId);
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin/squadre", error);
}

export async function movePlayerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const playerId = Number(formData.get("playerId"));
  const raw = String(formData.get("teamId") ?? "");
  let error: string | null = null;
  try {
    repo.movePlayer(playerId, raw ? Number(raw) : null);
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin/squadre", error);
}

// ---------------------------------------------------------------------------
// Gironi, partite, tabellone
// ---------------------------------------------------------------------------

export async function generateGroupsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  const numGroups = Number(formData.get("numGroups") ?? 1);
  let error: string | null = null;
  try {
    repo.generateGroups(tournamentId, numGroups);
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin/gironi", error);
}

export async function saveScoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  const sets: SetInput[] = [];
  for (let i = 1; i <= 3; i++) {
    const a = String(formData.get(`set${i}a`) ?? "").trim();
    const b = String(formData.get(`set${i}b`) ?? "").trim();
    if (a !== "" && b !== "") sets.push({ a: Number(a), b: Number(b) });
  }
  let error: string | null = null;
  try {
    repo.saveScore(matchId, sets);
  } catch (e) {
    error = errorMessage(e);
  }
  done(String(formData.get("back") ?? "/admin/partite"), error);
}

export async function forfeitAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  const teamId = Number(formData.get("teamId"));
  let error: string | null = null;
  try {
    repo.forfeitMatch(matchId, teamId);
  } catch (e) {
    error = errorMessage(e);
  }
  done(String(formData.get("back") ?? "/admin/partite"), error);
}

export async function clearScoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  let error: string | null = null;
  try {
    repo.clearScore(matchId);
  } catch (e) {
    error = errorMessage(e);
  }
  done(String(formData.get("back") ?? "/admin/partite"), error);
}

export async function scheduleMatchAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  const court = String(formData.get("court") ?? "").trim();
  const scheduledAt = String(formData.get("scheduledAt") ?? "").trim();
  let error: string | null = null;
  try {
    repo.scheduleMatch(matchId, court || null, scheduledAt || null);
  } catch (e) {
    error = errorMessage(e);
  }
  done(String(formData.get("back") ?? "/admin/partite"), error);
}

export async function generateKnockoutAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  let error: string | null = null;
  try {
    repo.generateKnockout(tournamentId);
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin/tabellone", error);
}
