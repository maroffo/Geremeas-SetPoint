import {
  allSets,
  getTournament,
  groupStandings,
  groupTeams,
  listGroups,
  listMatches,
  listTeams,
  podium,
  type GroupRow,
  type MatchRow,
  type Podium,
  type SetScoreRow,
  type TeamRow,
  type TournamentRow,
} from "./repo";
import type { StandingRow } from "./standings";

export interface MatchView extends MatchRow {
  sets: SetScoreRow[];
  teamAName: string;
  teamBName: string;
}

/**
 * Arricchisce una partita con i suoi set e i nomi delle due squadre, risolti
 * dalla mappa id→nome (placeholder "—" se lo slot è vuoto, "?" se il nome
 * manca). Helper condiviso da tutte le viste (home, archivio, vista pubblica
 * della squadra), così la forma di `MatchView` e la logica dei placeholder
 * vivono in un unico punto.
 */
export function toMatchView(
  m: MatchRow,
  teamNameById: Map<number, string>,
  setsByMatch: Map<number, SetScoreRow[]>,
): MatchView {
  return {
    ...m,
    sets: setsByMatch.get(m.id) ?? [],
    teamAName: m.team_a !== null ? (teamNameById.get(m.team_a) ?? "?") : "—",
    teamBName: m.team_b !== null ? (teamNameById.get(m.team_b) ?? "?") : "—",
  };
}

export interface GroupView {
  group: GroupRow;
  teams: TeamRow[];
  standings: StandingRow[];
  matches: MatchView[];
}

export interface TournamentView {
  tournament: TournamentRow;
  teamNames: Map<number, string>;
  groups: GroupView[];
  knockoutRounds: MatchView[][]; // per turno, senza 3º posto
  thirdPlace: MatchView | null;
  totalKnockoutRounds: number;
  podium: Podium;
  upcoming: MatchView[];
}

export function teamNameMap(tournamentId: number): Map<number, string> {
  const map = new Map<number, string>();
  for (const t of listTeams(tournamentId)) map.set(t.id, t.name);
  return map;
}

export function buildTournamentView(t: TournamentRow): TournamentView {
  const names = teamNameMap(t.id);
  const sets = allSets(t.id);
  const matches = listMatches(t.id);

  const toView = (m: MatchRow): MatchView => toMatchView(m, names, sets);
  const isAutomaticBye = (m: MatchView): boolean =>
    m.status === "finished" &&
    m.sets.length === 0 &&
    (m.team_a === null) !== (m.team_b === null);

  const groups: GroupView[] = listGroups(t.id).map((g) => ({
    group: g,
    teams: groupTeams(g.id),
    standings: groupStandings(g.id),
    matches: matches
      .filter((m) => m.phase === "group" && m.group_id === g.id)
      .map(toView),
  }));

  const knockout = matches.filter((m) => m.phase === "knockout");
  const totalKnockoutRounds = knockout
    .filter((m) => !m.is_third_place)
    .reduce((max, m) => Math.max(max, m.round), 0);
  const knockoutRounds: MatchView[][] = [];
  for (let r = 1; r <= totalKnockoutRounds; r++) {
    knockoutRounds.push(
      knockout
        .filter((m) => m.round === r && !m.is_third_place)
        .sort((a, b) => (a.bracket_pos ?? 0) - (b.bracket_pos ?? 0))
        .map(toView)
        .filter((m) => !isAutomaticBye(m)),
    );
  }
  const thirdPlaceRow = knockout.find((m) => m.is_third_place === 1);

  const upcoming = matches
    .filter((m) => m.status === "scheduled" && m.team_a && m.team_b)
    .map(toView)
    .sort((a, b) => {
      if (a.scheduled_at && b.scheduled_at)
        return a.scheduled_at.localeCompare(b.scheduled_at);
      if (a.scheduled_at) return -1;
      if (b.scheduled_at) return 1;
      return a.id - b.id;
    })
    .slice(0, 8);

  return {
    tournament: t,
    teamNames: names,
    groups,
    knockoutRounds,
    thirdPlace: thirdPlaceRow ? toView(thirdPlaceRow) : null,
    totalKnockoutRounds,
    podium: podium(t.id),
    upcoming,
  };
}

export interface ArchiveGroupView {
  name: string;
  standings: StandingRow[];
  matches: MatchView[];
}

/**
 * Vista di un'edizione conclusa: le stesse strutture della home meno le righe
 * che portano dati non pubblici, cioè `tournament` (contact_info) e i
 * `teams` dei gironi (contact, age_confirmed). Restano nomi delle squadre,
 * risultati e classifiche.
 */
export interface ArchiveView {
  id: number;
  name: string;
  year: number;
  teamNames: Map<number, string>;
  groups: ArchiveGroupView[];
  knockoutRounds: MatchView[][];
  thirdPlace: MatchView | null;
  totalKnockoutRounds: number;
  podium: Podium;
}

/**
 * Vista read-only di un'edizione conclusa: null se il torneo non esiste o non
 * è `finished`, così la pagina può rispondere 404 senza altri controlli. Il
 * controllo sullo stato precede la costruzione della vista.
 */
export function buildArchiveView(tournamentId: number): ArchiveView | null {
  const t = getTournament(tournamentId);
  if (!t || t.status !== "finished") return null;

  const view = buildTournamentView(t);
  return {
    id: t.id,
    name: t.name,
    year: t.year,
    teamNames: view.teamNames,
    groups: view.groups.map((g) => ({
      name: g.group.name,
      standings: g.standings,
      matches: g.matches,
    })),
    knockoutRounds: view.knockoutRounds,
    thirdPlace: view.thirdPlace,
    totalKnockoutRounds: view.totalKnockoutRounds,
    podium: view.podium,
  };
}

export function formatSets(m: MatchView): string {
  if (m.sets.length === 0) return "";
  return m.sets.map((s) => `${s.points_a}-${s.points_b}`).join(", ");
}

export function setsWon(m: MatchView): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of m.sets) {
    if (s.points_a > s.points_b) a++;
    else b++;
  }
  return { a, b };
}

// Nomi di giorno e mese in italiano, calcolati da componenti UTC espliciti.
const weekdayMonth = new Intl.DateTimeFormat("it-IT", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatSchedule(m: MatchView): string {
  const parts: string[] = [];
  if (m.scheduled_at) {
    // scheduled_at è naive "YYYY-MM-DDTHH:MM" (ora di parete a Roma): niente
    // `new Date(<stringa>)`, che la leggerebbe come UTC spostando gli orari
    // (vedi clock.ts). L'ora si prende tale e quale dalla stringa; per il solo
    // nome di giorno/mese si costruisce una data da componenti UTC espliciti
    // formattata in UTC, quindi indipendente dal fuso del server.
    const [date, time] = m.scheduled_at.split("T");
    const [year, month, day] = date.split("-").map(Number);
    const label = weekdayMonth.format(new Date(Date.UTC(year, month - 1, day)));
    parts.push(`${label}, ${time}`);
  }
  // Il nome del campo è libero (es. "Campo Mare"): niente prefisso fisso.
  if (m.court) parts.push(m.court);
  return parts.join(" · ");
}
