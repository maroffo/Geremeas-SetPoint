import { db } from "./db";
import {
  advanceTarget,
  firstRoundPairings,
  nextPowerOfTwo,
  roundCount,
  seedQualifiers,
} from "./bracket";
import { roundRobin } from "./roundRobin";
import { validateMatchScore } from "./score";
import { computeStandings, type StandingRow } from "./standings";
import { generateBalancedTeams } from "./teamGenerator";
import { agePhrase, validatePhone } from "./validation";
import type {
  Gender,
  PersonInput,
  ScoreRules,
  SetInput,
  TournamentFormat,
  TournamentStatus,
} from "./types";

export interface TournamentRow {
  id: number;
  name: string;
  year: number;
  team_size: number;
  format: TournamentFormat;
  best_of: number;
  points_per_set: number;
  points_last_set: number;
  advance_per_group: number;
  min_age: number | null;
  max_age: number | null;
  status: TournamentStatus;
}

export interface TeamRow {
  id: number;
  tournament_id: number;
  name: string;
  origin: "registered" | "generated";
  status: "pending" | "active" | "withdrawn";
  contact: string | null;
  group_id: number | null;
  /**
   * 0/1. Riepilogo per squadra della dichiarazione d'età; la fonte
   * autoritativa è players.age_confirmed (vale per ogni origine).
   */
  age_confirmed: number;
}

export interface PlayerRow {
  id: number;
  tournament_id: number;
  first_name: string;
  last_name: string;
  gender: Gender;
  skill: number | null;
  contact: string | null;
  team_id: number | null;
  is_reserve: number;
  /** 0/1. Fonte autoritativa della dichiarazione d'età del giocatore. */
  age_confirmed: number;
}

export interface GroupRow {
  id: number;
  tournament_id: number;
  name: string;
}

export interface MatchRow {
  id: number;
  tournament_id: number;
  phase: "group" | "knockout";
  group_id: number | null;
  round: number;
  bracket_pos: number | null;
  is_third_place: number;
  team_a: number | null;
  team_b: number | null;
  court: string | null;
  scheduled_at: string | null;
  status: "scheduled" | "finished" | "forfeit";
  winner: number | null;
  forfeit_team: number | null;
}

export interface SetScoreRow {
  match_id: number;
  set_number: number;
  points_a: number;
  points_b: number;
}

const GENERATED_TEAM_NAMES = [
  "Onda Anomala",
  "I Fenicotteri",
  "Sabbia nelle Scarpe",
  "Granchi Volanti",
  "Meduse Ribelli",
  "Colpo di Sole",
  "I Tramontana",
  "Vento di Maestrale",
  "Ricci di Mare",
  "Delfini di Geremeas",
  "Schiacciata al Pomodoro",
  "Muro del Bagnino",
  "I Paguri",
  "Tartarughe Marine",
  "Sardine Volanti",
  "Bagnasciuga FC",
  "Le Cicale",
  "Spuma di Mare",
  "I Ghiozzi",
  "Corallo Rosso",
  "Stelle Marine",
  "Pinne e Pallone",
  "Aragoste in Battuta",
  "Salsedine",
];

// ---------------------------------------------------------------------------
// Torneo
// ---------------------------------------------------------------------------

export function getActiveTournament(): TournamentRow | undefined {
  return db
    .prepare("SELECT * FROM tournaments ORDER BY id DESC LIMIT 1")
    .get() as TournamentRow | undefined;
}

export function getTournament(id: number): TournamentRow | undefined {
  return db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id) as
    | TournamentRow
    | undefined;
}

export function scoreRules(t: TournamentRow): ScoreRules {
  return {
    bestOf: t.best_of,
    pointsPerSet: t.points_per_set,
    pointsLastSet: t.best_of > 1 ? t.points_last_set : t.points_per_set,
  };
}

export interface TournamentSettings {
  name: string;
  year: number;
  teamSize: number;
  format: TournamentFormat;
  bestOf: number;
  pointsPerSet: number;
  pointsLastSet: number;
  advancePerGroup: number;
  minAge?: number | null;
  maxAge?: number | null;
}

function checkAgeBounds(s: TournamentSettings): void {
  for (const [label, v] of [
    ["minima", s.minAge],
    ["massima", s.maxAge],
  ] as const) {
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 120))
      throw new Error(`Età ${label} non valida`);
  }
  if (s.minAge != null && s.maxAge != null && s.minAge > s.maxAge)
    throw new Error("L'età minima non può superare la massima");
}

export function createTournament(s: TournamentSettings): number {
  checkAgeBounds(s);
  const res = db
    .prepare(
      `INSERT INTO tournaments
       (name, year, team_size, format, best_of, points_per_set, points_last_set, advance_per_group, min_age, max_age)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.name,
      s.year,
      s.teamSize,
      s.format,
      s.bestOf,
      s.pointsPerSet,
      s.pointsLastSet,
      s.advancePerGroup,
      s.minAge ?? null,
      s.maxAge ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function updateTournament(id: number, s: TournamentSettings): void {
  checkAgeBounds(s);
  db.prepare(
    `UPDATE tournaments SET name = ?, year = ?, team_size = ?, format = ?,
     best_of = ?, points_per_set = ?, points_last_set = ?, advance_per_group = ?,
     min_age = ?, max_age = ?
     WHERE id = ?`,
  ).run(
    s.name,
    s.year,
    s.teamSize,
    s.format,
    s.bestOf,
    s.pointsPerSet,
    s.pointsLastSet,
    s.advancePerGroup,
    s.minAge ?? null,
    s.maxAge ?? null,
    id,
  );
}

export function setTournamentStatus(id: number, status: TournamentStatus): void {
  db.prepare("UPDATE tournaments SET status = ? WHERE id = ?").run(status, id);
}

// ---------------------------------------------------------------------------
// Iscrizioni
// ---------------------------------------------------------------------------

function checkAgeDeclaration(t: TournamentRow, ageConfirmed: boolean): void {
  const phrase = agePhrase({ minAge: t.min_age, maxAge: t.max_age });
  if (phrase && !ageConfirmed)
    throw new Error(
      `Questo torneo richiede ${phrase}: conferma il requisito d'età`,
    );
}

function checkContact(contact: string): string {
  const phone = validatePhone(contact);
  if (!phone) throw new Error("Indica un numero di telefono valido");
  return phone;
}

export function registerTeam(
  tournamentId: number,
  teamName: string,
  contact: string,
  people: PersonInput[],
  ageConfirmed = false,
): number {
  const t = getTournament(tournamentId);
  if (!t) throw new Error("Torneo non trovato");
  if (t.status !== "registration")
    throw new Error("Le iscrizioni sono chiuse");
  checkAgeDeclaration(t, ageConfirmed);
  const phone = checkContact(contact);

  const name = teamName.trim();
  if (!name) throw new Error("Indica il nome della squadra");

  const valid = people.filter(
    (p) => p.firstName.trim() && p.lastName.trim(),
  );
  if (valid.length < t.team_size)
    throw new Error(`Servono almeno ${t.team_size} giocatori`);
  if (valid.length > t.team_size + 2)
    throw new Error(`Al massimo ${t.team_size + 2} giocatori (riserve incluse)`);
  if (!valid.some((p) => p.gender === "F"))
    throw new Error("Ogni squadra deve avere almeno una ragazza");

  const dup = db
    .prepare(
      "SELECT 1 FROM teams WHERE tournament_id = ? AND lower(name) = lower(?)",
    )
    .get(tournamentId, name);
  if (dup) throw new Error("Esiste già una squadra con questo nome");

  const insertTeam = db.prepare(
    `INSERT INTO teams (tournament_id, name, origin, status, contact, age_confirmed)
     VALUES (?, ?, 'registered', 'pending', ?, ?)`,
  );
  const insertPlayer = db.prepare(
    `INSERT INTO players (tournament_id, first_name, last_name, gender, team_id, is_reserve, age_confirmed)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    const teamId = Number(
      insertTeam.run(tournamentId, name, phone, ageConfirmed ? 1 : 0)
        .lastInsertRowid,
    );
    // La dichiarazione del capitano vale per tutti i componenti: si propaga
    // ai giocatori, che restano la fonte autoritativa di age_confirmed.
    valid.forEach((p, i) => {
      insertPlayer.run(
        tournamentId,
        p.firstName.trim(),
        p.lastName.trim(),
        p.gender,
        teamId,
        i >= t.team_size ? 1 : 0,
        ageConfirmed ? 1 : 0,
      );
    });
    return teamId;
  });
  return tx();
}

export function registerSingle(
  tournamentId: number,
  person: PersonInput,
  contact: string,
  ageConfirmed = false,
): number {
  const t = getTournament(tournamentId);
  if (!t) throw new Error("Torneo non trovato");
  if (t.status !== "registration")
    throw new Error("Le iscrizioni sono chiuse");
  checkAgeDeclaration(t, ageConfirmed);
  const phone = checkContact(contact);
  if (!person.firstName.trim() || !person.lastName.trim())
    throw new Error("Nome e cognome sono obbligatori");
  const skill = person.skill ?? 0;
  if (!Number.isInteger(skill) || skill < 1 || skill > 10)
    throw new Error("La bravura va da 1 a 10");

  const res = db
    .prepare(
      `INSERT INTO players (tournament_id, first_name, last_name, gender, skill, contact, age_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      tournamentId,
      person.firstName.trim(),
      person.lastName.trim(),
      person.gender,
      skill,
      phone,
      ageConfirmed ? 1 : 0,
    );
  return Number(res.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Squadre e giocatori
// ---------------------------------------------------------------------------

export function listTeams(tournamentId: number): TeamRow[] {
  return db
    .prepare(
      "SELECT * FROM teams WHERE tournament_id = ? ORDER BY status = 'withdrawn', name",
    )
    .all(tournamentId) as TeamRow[];
}

export function listActiveTeams(tournamentId: number): TeamRow[] {
  return db
    .prepare(
      "SELECT * FROM teams WHERE tournament_id = ? AND status = 'active' ORDER BY name",
    )
    .all(tournamentId) as TeamRow[];
}

export function teamPlayers(teamId: number): PlayerRow[] {
  return db
    .prepare(
      "SELECT * FROM players WHERE team_id = ? ORDER BY is_reserve, last_name, first_name",
    )
    .all(teamId) as PlayerRow[];
}

export function listPlayersByTeam(
  tournamentId: number,
): Map<number, PlayerRow[]> {
  const rows = db
    .prepare(
      `SELECT * FROM players WHERE tournament_id = ? AND team_id IS NOT NULL
       ORDER BY is_reserve, last_name, first_name`,
    )
    .all(tournamentId) as PlayerRow[];
  const map = new Map<number, PlayerRow[]>();
  for (const r of rows) {
    const list = map.get(r.team_id!) ?? [];
    list.push(r);
    map.set(r.team_id!, list);
  }
  return map;
}

/** Iscritti singoli non ancora assegnati a una squadra. */
export function listUnassignedSingles(tournamentId: number): PlayerRow[] {
  return db
    .prepare(
      `SELECT * FROM players
       WHERE tournament_id = ? AND team_id IS NULL AND skill IS NOT NULL
       ORDER BY is_reserve, skill DESC, last_name`,
    )
    .all(tournamentId) as PlayerRow[];
}

export function setTeamStatus(
  teamId: number,
  status: "pending" | "active" | "withdrawn",
): void {
  db.prepare("UPDATE teams SET status = ? WHERE id = ?").run(status, teamId);
}

export function deleteTeam(teamId: number): void {
  const tx = db.transaction(() => {
    // I singoli tornano nella lista dei non assegnati, i giocatori
    // iscritti con la squadra vengono rimossi.
    db.prepare(
      "UPDATE players SET team_id = NULL, is_reserve = 0 WHERE team_id = ? AND skill IS NOT NULL",
    ).run(teamId);
    db.prepare("DELETE FROM players WHERE team_id = ? AND skill IS NULL").run(
      teamId,
    );
    db.prepare("DELETE FROM teams WHERE id = ?").run(teamId);
  });
  tx();
}

/**
 * Genera le squadre dai singoli iscritti. Le squadre generate in precedenza
 * vengono sciolte e ricreate da zero (possibile solo prima dei gironi).
 */
export function generateTeamsFromSingles(tournamentId: number): {
  created: number;
  reserves: number;
} {
  const t = getTournament(tournamentId);
  if (!t) throw new Error("Torneo non trovato");
  if (t.status !== "registration")
    throw new Error("Le squadre si generano prima di creare i gironi");

  const tx = db.transaction(() => {
    const oldGenerated = db
      .prepare(
        "SELECT id FROM teams WHERE tournament_id = ? AND origin = 'generated'",
      )
      .all(tournamentId) as { id: number }[];
    for (const g of oldGenerated) {
      db.prepare(
        "UPDATE players SET team_id = NULL, is_reserve = 0 WHERE team_id = ?",
      ).run(g.id);
      db.prepare("DELETE FROM teams WHERE id = ?").run(g.id);
    }

    const unassigned = listUnassignedSingles(tournamentId);
    const confirmedIds = new Set(
      unassigned.filter((p) => p.age_confirmed === 1).map((p) => p.id),
    );
    const singles = unassigned.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      gender: p.gender,
      skill: p.skill ?? 1,
    }));

    const { teams, reserves } = generateBalancedTeams(singles, t.team_size);

    const usedNames = new Set(
      (
        db
          .prepare("SELECT name FROM teams WHERE tournament_id = ?")
          .all(tournamentId) as { name: string }[]
      ).map((r) => r.name.toLowerCase()),
    );
    const namePool = GENERATED_TEAM_NAMES.filter(
      (n) => !usedNames.has(n.toLowerCase()),
    );

    // Il riepilogo di squadra riflette i componenti: confermata solo se
    // tutti i singoli assegnati hanno dichiarato individualmente.
    const insertTeam = db.prepare(
      `INSERT INTO teams (tournament_id, name, origin, status, age_confirmed)
       VALUES (?, ?, 'generated', 'active', ?)`,
    );
    const assign = db.prepare(
      "UPDATE players SET team_id = ?, is_reserve = 0 WHERE id = ?",
    );
    const markReserve = db.prepare(
      "UPDATE players SET team_id = NULL, is_reserve = 1 WHERE id = ?",
    );

    teams.forEach((team, i) => {
      const name = namePool[i] ?? `Squadra ${i + 1}`;
      const allConfirmed = team.every((pl) => confirmedIds.has(pl.id));
      const teamId = Number(
        insertTeam.run(tournamentId, name, allConfirmed ? 1 : 0).lastInsertRowid,
      );
      for (const pl of team) assign.run(teamId, pl.id);
    });
    for (const pl of reserves) markReserve.run(pl.id);

    return { created: teams.length, reserves: reserves.length };
  });
  return tx();
}

export function movePlayer(playerId: number, teamId: number | null): void {
  db.prepare(
    "UPDATE players SET team_id = ?, is_reserve = 0 WHERE id = ?",
  ).run(teamId, playerId);
}

export function deletePlayer(playerId: number): void {
  db.prepare("DELETE FROM players WHERE id = ?").run(playerId);
}

// ---------------------------------------------------------------------------
// Gironi
// ---------------------------------------------------------------------------

export function listGroups(tournamentId: number): GroupRow[] {
  return db
    .prepare("SELECT * FROM groups WHERE tournament_id = ? ORDER BY name")
    .all(tournamentId) as GroupRow[];
}

export function groupTeams(groupId: number): TeamRow[] {
  return db
    .prepare("SELECT * FROM teams WHERE group_id = ? ORDER BY name")
    .all(groupId) as TeamRow[];
}

/**
 * Crea i gironi distribuendo le squadre attive in modo casuale
 * e genera il calendario round robin di ogni girone.
 */
export function generateGroups(tournamentId: number, numGroups: number): void {
  const t = getTournament(tournamentId);
  if (!t) throw new Error("Torneo non trovato");

  const teams = db
    .prepare(
      "SELECT id FROM teams WHERE tournament_id = ? AND status = 'active' ORDER BY RANDOM()",
    )
    .all(tournamentId) as { id: number }[];

  if (teams.length < 2) throw new Error("Servono almeno 2 squadre attive");
  if (numGroups < 1 || numGroups > teams.length / 2)
    throw new Error(
      `Numero gironi non valido: con ${teams.length} squadre puoi creare da 1 a ${Math.floor(teams.length / 2)} gironi`,
    );

  const tx = db.transaction(() => {
    // Ripulisce gironi e partite di girone precedenti
    db.prepare(
      "DELETE FROM matches WHERE tournament_id = ? AND phase = 'group'",
    ).run(tournamentId);
    db.prepare("UPDATE teams SET group_id = NULL WHERE tournament_id = ?").run(
      tournamentId,
    );
    db.prepare("DELETE FROM groups WHERE tournament_id = ?").run(tournamentId);

    const insertGroup = db.prepare(
      "INSERT INTO groups (tournament_id, name) VALUES (?, ?)",
    );
    const groupIds: number[] = [];
    for (let i = 0; i < numGroups; i++) {
      const name = `Girone ${String.fromCharCode(65 + i)}`;
      groupIds.push(Number(insertGroup.run(tournamentId, name).lastInsertRowid));
    }

    // Distribuzione a serpentina
    const assignTeam = db.prepare("UPDATE teams SET group_id = ? WHERE id = ?");
    const perGroup: number[][] = groupIds.map(() => []);
    teams.forEach((team, i) => {
      const cycle = Math.floor(i / numGroups);
      const idx = i % numGroups;
      const gi = cycle % 2 === 0 ? idx : numGroups - 1 - idx;
      perGroup[gi].push(team.id);
      assignTeam.run(groupIds[gi], team.id);
    });

    const insertMatch = db.prepare(
      `INSERT INTO matches (tournament_id, phase, group_id, round, team_a, team_b)
       VALUES (?, 'group', ?, ?, ?, ?)`,
    );
    groupIds.forEach((gid, gi) => {
      for (const m of roundRobin(perGroup[gi])) {
        insertMatch.run(tournamentId, gid, m.round, m.a, m.b);
      }
    });

    db.prepare("UPDATE tournaments SET status = 'groups' WHERE id = ?").run(
      tournamentId,
    );
  });
  tx();
}

export function groupStandings(groupId: number): StandingRow[] {
  const teams = groupTeams(groupId).map((t) => t.id);
  const matches = db
    .prepare(
      `SELECT m.*,
        (SELECT COALESCE(SUM(points_a > points_b), 0) FROM set_scores WHERE match_id = m.id) AS sets_a,
        (SELECT COALESCE(SUM(points_b > points_a), 0) FROM set_scores WHERE match_id = m.id) AS sets_b,
        (SELECT COALESCE(SUM(points_a), 0) FROM set_scores WHERE match_id = m.id) AS pts_a,
        (SELECT COALESCE(SUM(points_b), 0) FROM set_scores WHERE match_id = m.id) AS pts_b
       FROM matches m
       WHERE m.group_id = ? AND m.status IN ('finished','forfeit')
         AND m.winner IS NOT NULL`,
    )
    .all(groupId) as (MatchRow & {
    sets_a: number;
    sets_b: number;
    pts_a: number;
    pts_b: number;
  })[];

  return computeStandings(
    teams,
    matches
      .filter((m) => m.team_a !== null && m.team_b !== null)
      .map((m) => ({
        teamA: m.team_a!,
        teamB: m.team_b!,
        setsA: m.sets_a,
        setsB: m.sets_b,
        pointsA: m.pts_a,
        pointsB: m.pts_b,
        winner: m.winner!,
      })),
  );
}

// ---------------------------------------------------------------------------
// Partite e punteggi
// ---------------------------------------------------------------------------

export function listMatches(tournamentId: number): MatchRow[] {
  return db
    .prepare(
      `SELECT * FROM matches WHERE tournament_id = ?
       ORDER BY phase = 'knockout', round, bracket_pos, id`,
    )
    .all(tournamentId) as MatchRow[];
}

export function getMatch(matchId: number): MatchRow | undefined {
  return db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as
    | MatchRow
    | undefined;
}

export function matchSets(matchId: number): SetScoreRow[] {
  return db
    .prepare("SELECT * FROM set_scores WHERE match_id = ? ORDER BY set_number")
    .all(matchId) as SetScoreRow[];
}

export function allSets(tournamentId: number): Map<number, SetScoreRow[]> {
  const rows = db
    .prepare(
      `SELECT s.* FROM set_scores s
       JOIN matches m ON m.id = s.match_id
       WHERE m.tournament_id = ?
       ORDER BY s.match_id, s.set_number`,
    )
    .all(tournamentId) as SetScoreRow[];
  const map = new Map<number, SetScoreRow[]>();
  for (const r of rows) {
    const list = map.get(r.match_id) ?? [];
    list.push(r);
    map.set(r.match_id, list);
  }
  return map;
}

export function scheduleMatch(
  matchId: number,
  court: string | null,
  scheduledAt: string | null,
): void {
  db.prepare("UPDATE matches SET court = ?, scheduled_at = ? WHERE id = ?").run(
    court || null,
    scheduledAt || null,
    matchId,
  );
}

export function saveScore(matchId: number, sets: SetInput[]): void {
  const match = getMatch(matchId);
  if (!match) throw new Error("Partita non trovata");
  if (match.team_a === null || match.team_b === null)
    throw new Error("Le due squadre non sono ancora definite");

  const t = getTournament(match.tournament_id)!;
  const result = validateMatchScore(sets, scoreRules(t));
  if (!result.ok) throw new Error(result.error);

  const winner = result.score.winner === "A" ? match.team_a : match.team_b;

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM set_scores WHERE match_id = ?").run(matchId);
    const insert = db.prepare(
      "INSERT INTO set_scores (match_id, set_number, points_a, points_b) VALUES (?, ?, ?, ?)",
    );
    sets.forEach((s, i) => insert.run(matchId, i + 1, s.a, s.b));
    db.prepare(
      "UPDATE matches SET status = 'finished', winner = ?, forfeit_team = NULL WHERE id = ?",
    ).run(winner, matchId);

    if (match.phase === "knockout") propagateKnockout(match, winner);
  });
  tx();
}

/** Vittoria a tavolino: 2-0 (o set secco) con set a `pointsPerSet`-0. */
export function forfeitMatch(matchId: number, forfeitTeamId: number): void {
  const match = getMatch(matchId);
  if (!match) throw new Error("Partita non trovata");
  if (match.team_a === null || match.team_b === null)
    throw new Error("Le due squadre non sono ancora definite");
  if (forfeitTeamId !== match.team_a && forfeitTeamId !== match.team_b)
    throw new Error("La squadra indicata non gioca questa partita");

  const t = getTournament(match.tournament_id)!;
  const winner = forfeitTeamId === match.team_a ? match.team_b : match.team_a;
  const setsNeeded = Math.ceil(t.best_of / 2);
  const winnerIsA = winner === match.team_a;

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM set_scores WHERE match_id = ?").run(matchId);
    const insert = db.prepare(
      "INSERT INTO set_scores (match_id, set_number, points_a, points_b) VALUES (?, ?, ?, ?)",
    );
    for (let i = 1; i <= setsNeeded; i++) {
      insert.run(
        matchId,
        i,
        winnerIsA ? t.points_per_set : 0,
        winnerIsA ? 0 : t.points_per_set,
      );
    }
    db.prepare(
      "UPDATE matches SET status = 'forfeit', winner = ?, forfeit_team = ? WHERE id = ?",
    ).run(winner, forfeitTeamId, matchId);

    if (match.phase === "knockout") propagateKnockout(match, winner);
  });
  tx();
}

export function clearScore(matchId: number): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM set_scores WHERE match_id = ?").run(matchId);
    db.prepare(
      "UPDATE matches SET status = 'scheduled', winner = NULL, forfeit_team = NULL WHERE id = ?",
    ).run(matchId);
  });
  tx();
}

// ---------------------------------------------------------------------------
// Tabellone a eliminazione diretta
// ---------------------------------------------------------------------------

function knockoutTotalRounds(tournamentId: number): number {
  const row = db
    .prepare(
      `SELECT MAX(round) AS r FROM matches
       WHERE tournament_id = ? AND phase = 'knockout' AND is_third_place = 0`,
    )
    .get(tournamentId) as { r: number | null };
  return row.r ?? 0;
}

function propagateKnockout(match: MatchRow, winner: number): void {
  const totalRounds = knockoutTotalRounds(match.tournament_id);
  if (match.is_third_place || match.round >= totalRounds) return;
  if (match.bracket_pos === null) return;

  const target = advanceTarget(match.bracket_pos);
  const column = target.slot === "A" ? "team_a" : "team_b";
  db.prepare(
    `UPDATE matches SET ${column} = ?
     WHERE tournament_id = ? AND phase = 'knockout' AND is_third_place = 0
       AND round = ? AND bracket_pos = ?`,
  ).run(winner, match.tournament_id, match.round + 1, target.pos);

  // Il perdente della semifinale va alla finale 3º/4º posto
  if (match.round === totalRounds - 1 && match.team_a && match.team_b) {
    const loser = winner === match.team_a ? match.team_b : match.team_a;
    const loserColumn = match.bracket_pos % 2 === 0 ? "team_a" : "team_b";
    db.prepare(
      `UPDATE matches SET ${loserColumn} = ?
       WHERE tournament_id = ? AND phase = 'knockout' AND is_third_place = 1`,
    ).run(loser, match.tournament_id);
  }
}

/**
 * Genera il tabellone a eliminazione diretta.
 * Con formato a gironi il seeding viene dalle classifiche; con formato
 * a sola eliminazione le squadre attive vengono sorteggiate.
 */
export function generateKnockout(tournamentId: number): void {
  const t = getTournament(tournamentId);
  if (!t) throw new Error("Torneo non trovato");

  let seeds: number[];
  if (t.format === "knockout_only" || listGroups(tournamentId).length === 0) {
    seeds = (
      db
        .prepare(
          "SELECT id FROM teams WHERE tournament_id = ? AND status = 'active' ORDER BY RANDOM()",
        )
        .all(tournamentId) as { id: number }[]
    ).map((r) => r.id);
  } else {
    const unfinished = db
      .prepare(
        `SELECT COUNT(*) AS n FROM matches
         WHERE tournament_id = ? AND phase = 'group' AND status = 'scheduled'`,
      )
      .get(tournamentId) as { n: number };
    if (unfinished.n > 0)
      throw new Error(
        `Ci sono ancora ${unfinished.n} partite di girone da giocare`,
      );
    const standings = listGroups(tournamentId).map((g) => groupStandings(g.id));
    seeds = seedQualifiers(standings, t.advance_per_group);
  }

  if (seeds.length < 2)
    throw new Error("Servono almeno 2 squadre qualificate");

  const size = nextPowerOfTwo(seeds.length);
  const rounds = roundCount(size);
  const pairings = firstRoundPairings(seeds);

  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM matches WHERE tournament_id = ? AND phase = 'knockout'",
    ).run(tournamentId);

    const insert = db.prepare(
      `INSERT INTO matches
       (tournament_id, phase, round, bracket_pos, is_third_place, team_a, team_b)
       VALUES (?, 'knockout', ?, ?, ?, ?, ?)`,
    );

    // Primo turno con le squadre, turni successivi vuoti
    for (const p of pairings) {
      insert.run(tournamentId, 1, p.pos, 0, p.teamA, p.teamB);
    }
    for (let r = 2; r <= rounds; r++) {
      const matchesInRound = size / Math.pow(2, r);
      for (let pos = 0; pos < matchesInRound; pos++) {
        insert.run(tournamentId, r, pos, 0, null, null);
      }
    }
    // Finale 3º/4º posto (solo se ci sono semifinali)
    if (rounds >= 2) {
      insert.run(tournamentId, rounds, 0, 1, null, null);
    }

    db.prepare("UPDATE tournaments SET status = 'knockout' WHERE id = ?").run(
      tournamentId,
    );
  });
  tx();

  // I bye del primo turno avanzano subito
  const byes = db
    .prepare(
      `SELECT * FROM matches
       WHERE tournament_id = ? AND phase = 'knockout' AND round = 1
         AND ((team_a IS NULL AND team_b IS NOT NULL)
           OR (team_a IS NOT NULL AND team_b IS NULL))`,
    )
    .all(tournamentId) as MatchRow[];
  for (const m of byes) {
    const winner = (m.team_a ?? m.team_b)!;
    db.prepare(
      "UPDATE matches SET status = 'finished', winner = ? WHERE id = ?",
    ).run(winner, m.id);
    propagateKnockout(m, winner);
  }
}

export interface Podium {
  first: number | null;
  second: number | null;
  third: number | null;
}

export function podium(tournamentId: number): Podium {
  const totalRounds = knockoutTotalRounds(tournamentId);
  const final = db
    .prepare(
      `SELECT * FROM matches WHERE tournament_id = ? AND phase = 'knockout'
       AND is_third_place = 0 AND round = ?`,
    )
    .get(tournamentId, totalRounds) as MatchRow | undefined;
  const third = db
    .prepare(
      `SELECT * FROM matches WHERE tournament_id = ? AND phase = 'knockout'
       AND is_third_place = 1`,
    )
    .get(tournamentId) as MatchRow | undefined;

  const first = final?.winner ?? null;
  const second =
    final?.winner && final.team_a && final.team_b
      ? final.winner === final.team_a
        ? final.team_b
        : final.team_a
      : null;
  return { first, second, third: third?.winner ?? null };
}
