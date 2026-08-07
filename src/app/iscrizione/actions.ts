"use server";

import { redirect } from "next/navigation";
import { getActiveTournament, registerSingle, registerTeam } from "@/lib/repo";
import type { Gender, PersonInput } from "@/lib/types";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Errore imprevisto";
}

export async function registerTeamAction(formData: FormData): Promise<void> {
  const tournament = getActiveTournament();
  let error: string | null = null;

  if (!tournament) {
    error = "Nessun torneo attivo";
  } else {
    const teamName = String(formData.get("teamName") ?? "");
    const contact = String(formData.get("contact") ?? "").trim();
    const people: PersonInput[] = [];
    for (let i = 0; i < tournament.team_size + 2; i++) {
      const firstName = String(formData.get(`p${i}_first`) ?? "").trim();
      const lastName = String(formData.get(`p${i}_last`) ?? "").trim();
      const gender = String(formData.get(`p${i}_gender`) ?? "M") as Gender;
      if (firstName || lastName) people.push({ firstName, lastName, gender });
    }
    if (!contact) {
      error = "Indica un contatto per la squadra";
    } else {
      try {
        registerTeam(tournament.id, teamName, contact, people);
      } catch (e) {
        error = errorMessage(e);
      }
    }
  }

  redirect(
    error
      ? `/iscrizione/squadra?error=${encodeURIComponent(error)}`
      : "/iscrizione/squadra?ok=1",
  );
}

export async function registerSingleAction(formData: FormData): Promise<void> {
  const tournament = getActiveTournament();
  let error: string | null = null;

  if (!tournament) {
    error = "Nessun torneo attivo";
  } else {
    const contact = String(formData.get("contact") ?? "").trim();
    const person: PersonInput = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      gender: String(formData.get("gender") ?? "M") as Gender,
      skill: Number(formData.get("skill") ?? 0),
    };
    if (!contact) {
      error = "Indica un contatto (telefono o email)";
    } else {
      try {
        registerSingle(tournament.id, person, contact);
      } catch (e) {
        error = errorMessage(e);
      }
    }
  }

  redirect(
    error
      ? `/iscrizione/singolo?error=${encodeURIComponent(error)}`
      : "/iscrizione/singolo?ok=1",
  );
}
