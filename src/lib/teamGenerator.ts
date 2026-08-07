import type { DraftPlayer } from "./types";

export interface GeneratedTeams {
  teams: DraftPlayer[][];
  reserves: DraftPlayer[];
}

/**
 * Compone squadre bilanciate a partire dagli iscritti singoli.
 *
 * Vincoli:
 * - ogni squadra deve avere almeno una ragazza, quindi il numero di squadre
 *   non può superare il numero di ragazze iscritte;
 * - le squadre hanno esattamente `teamSize` giocatori, gli avanzi diventano riserve.
 *
 * Bilanciamento: le ragazze più forti vengono distribuite una per squadra,
 * poi i restanti giocatori (in ordine di bravura decrescente) vengono assegnati
 * di volta in volta alla squadra non completa con la somma di bravura più bassa,
 * così da minimizzare il divario tra la squadra più forte e la più debole.
 */
export function generateBalancedTeams(
  players: DraftPlayer[],
  teamSize: number,
): GeneratedTeams {
  if (teamSize < 2) throw new Error("La dimensione squadra deve essere almeno 2");

  const bySkillDesc = (a: DraftPlayer, b: DraftPlayer) =>
    b.skill - a.skill || a.id - b.id;

  const females = players.filter((p) => p.gender === "F").sort(bySkillDesc);
  const numTeams = Math.min(Math.floor(players.length / teamSize), females.length);

  if (numTeams === 0) {
    if (females.length === 0)
      throw new Error(
        "Nessuna ragazza tra gli iscritti singoli: impossibile formare squadre valide",
      );
    throw new Error(
      `Iscritti insufficienti: servono almeno ${teamSize} giocatori per formare una squadra`,
    );
  }

  const teams: DraftPlayer[][] = Array.from({ length: numTeams }, () => []);
  const totals = new Array<number>(numTeams).fill(0);

  // Una ragazza per squadra, in ordine di bravura.
  const seededFemales = females.slice(0, numTeams);
  seededFemales.forEach((f, i) => {
    teams[i].push(f);
    totals[i] += f.skill;
  });

  const seededIds = new Set(seededFemales.map((f) => f.id));
  const pool = players.filter((p) => !seededIds.has(p.id)).sort(bySkillDesc);

  const reserves: DraftPlayer[] = [];
  for (const p of pool) {
    let target = -1;
    for (let i = 0; i < numTeams; i++) {
      if (teams[i].length >= teamSize) continue;
      if (
        target === -1 ||
        totals[i] < totals[target] ||
        (totals[i] === totals[target] && teams[i].length < teams[target].length)
      ) {
        target = i;
      }
    }
    if (target === -1) {
      reserves.push(p);
    } else {
      teams[target].push(p);
      totals[target] += p.skill;
    }
  }

  return { teams, reserves };
}

export function teamSkillTotal(team: DraftPlayer[]): number {
  return team.reduce((sum, p) => sum + p.skill, 0);
}
