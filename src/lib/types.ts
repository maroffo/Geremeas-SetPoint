export type Gender = "M" | "F";

export type TournamentFormat = "groups_knockout" | "groups_only" | "knockout_only";

export type TournamentStatus =
  | "registration"
  | "groups"
  | "knockout"
  | "finished";

export type MatchPhase = "group" | "knockout";

export type MatchStatus = "scheduled" | "finished" | "forfeit";

export interface ScoreRules {
  bestOf: number; // 1 o 3
  pointsPerSet: number; // default 21
  pointsLastSet: number; // default 15 (set decisivo)
}

export interface PersonInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  skill?: number;
}

export interface DraftPlayer {
  id: number;
  firstName: string;
  lastName: string;
  gender: Gender;
  skill: number;
}

export interface SetInput {
  a: number;
  b: number;
}
