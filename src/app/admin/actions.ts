"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin, requireAdmin, requireScorer } from "@/lib/auth";
import * as repo from "@/lib/repo";
import type { SetInput, TournamentFormat, TournamentStatus } from "@/lib/types";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Errore imprevisto";
}

function done(back: string, error: string | null): never {
  // back arriva da campi hidden: si accettano solo path interni,
  // mai URL assoluti (open redirect).
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/admin";
  revalidatePath("/");
  redirect(error ? `${safeBack}?error=${encodeURIComponent(error)}` : safeBack);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData): Promise<void> {
  const pin = String(formData.get("pin") ?? "");
  const role = await loginAdmin(pin);
  if (!role) redirect("/admin/login?error=PIN%20errato");
  redirect(role === "admin" ? "/admin" : "/admin/partite");
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
    contactInfo: String(formData.get("contactInfo") ?? "").trim() || null,
    matchMinutes: Number(formData.get("matchMinutes") ?? 40),
  };
}

const POSTER_MAX_BYTES = 2 * 1024 * 1024;
const POSTER_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Legge la locandina dal form; null se non è stato scelto un file. */
async function posterFromForm(formData: FormData): Promise<repo.Poster | null> {
  const file = formData.get("poster");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!POSTER_MIMES.has(file.type))
    throw new Error("La locandina deve essere JPEG, PNG o WebP");
  if (file.size > POSTER_MAX_BYTES)
    throw new Error("La locandina non può superare i 2MB");
  return { data: Buffer.from(await file.arrayBuffer()), mime: file.type };
}

export async function createTournamentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let error: string | null = null;
  try {
    const poster = await posterFromForm(formData);
    const id = repo.createTournament(settingsFromForm(formData));
    if (poster) repo.setPoster(id, poster);
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
    const poster = await posterFromForm(formData);
    repo.updateTournament(id, settingsFromForm(formData));
    if (poster) repo.setPoster(id, poster);
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

export async function addDayAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  let error: string | null = null;
  try {
    repo.addDay(
      tournamentId,
      String(formData.get("date") ?? ""),
      String(formData.get("startTime") ?? ""),
      String(formData.get("endTime") ?? ""),
    );
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

export async function deleteDayAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let error: string | null = null;
  try {
    repo.deleteDay(Number(formData.get("dayId")));
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

export async function addCourtAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  let error: string | null = null;
  try {
    repo.addCourt(tournamentId, String(formData.get("name") ?? ""));
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

export async function deleteCourtAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let error: string | null = null;
  try {
    repo.deleteCourt(Number(formData.get("courtId")));
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin", error);
}

export async function generateScheduleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  let error: string | null = null;
  try {
    const { placed, unplaced } = repo.generateSchedule(tournamentId);
    if (unplaced > 0)
      error = `Calendario parziale: ${placed} partite programmate, ${unplaced} senza posto. Aggiungi giornate o campi, oppure allunga gli orari.`;
  } catch (e) {
    error = errorMessage(e);
  }
  done("/admin/partite", error);
}

export async function updateTeamContactAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const teamId = Number(formData.get("teamId"));
  const back = String(formData.get("back") ?? "/admin/iscrizioni");
  let error: string | null = null;
  try {
    repo.updateTeamContact(teamId, String(formData.get("contact") ?? ""));
  } catch (e) {
    error = errorMessage(e);
  }
  done(back, error);
}

export async function updatePlayerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const playerId = Number(formData.get("playerId"));
  const back = String(formData.get("back") ?? "/admin/iscrizioni");
  let error: string | null = null;
  try {
    const rawSkill = String(formData.get("skill") ?? "").trim();
    repo.updatePlayer(
      playerId,
      String(formData.get("firstName") ?? ""),
      String(formData.get("lastName") ?? ""),
      rawSkill ? Number(rawSkill) : null,
      String(formData.get("contact") ?? ""),
    );
  } catch (e) {
    error = errorMessage(e);
  }
  done(back, error);
}

export async function createTeamAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  const back = String(formData.get("back") ?? "/admin/iscrizioni");
  let error: string | null = null;
  try {
    repo.createAdminTeam(
      tournamentId,
      String(formData.get("teamName") ?? ""),
      String(formData.get("contact") ?? "").trim() || null,
    );
  } catch (e) {
    error = errorMessage(e);
  }
  done(back, error);
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
  await requireScorer();
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
  await requireScorer();
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
  await requireScorer();
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
