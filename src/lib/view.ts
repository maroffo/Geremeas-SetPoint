import {
  allSets,
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

  const toView = (m: MatchRow): MatchView => ({
    ...m,
    sets: sets.get(m.id) ?? [],
    teamAName: m.team_a !== null ? (names.get(m.team_a) ?? "?") : "—",
    teamBName: m.team_b !== null ? (names.get(m.team_b) ?? "?") : "—",
  });

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
        .map(toView),
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

export function formatSchedule(m: MatchView): string {
  const parts: string[] = [];
  if (m.scheduled_at) {
    const d = new Date(m.scheduled_at);
    parts.push(
      d.toLocaleString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }
  if (m.court) parts.push(`Campo ${m.court}`);
  return parts.join(" · ");
}
