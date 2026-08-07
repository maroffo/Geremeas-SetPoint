/**
 * Popola il database con dati di prova: torneo, squadre iscritte,
 * singoli, squadre generate, gironi e qualche risultato.
 *
 * Uso: npm run seed  (ricrea data/geremeas.db da zero)
 */
import fs from "node:fs";
import path from "node:path";
import type { Gender } from "../src/lib/types";

const dbFile =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "geremeas.db");
fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });

async function main() {
  const repo = await import("../src/lib/repo");

const tournamentId = repo.createTournament({
  name: "Torneo di Geremeas",
  year: new Date().getFullYear(),
  teamSize: 4,
  format: "groups_knockout",
  bestOf: 3,
  pointsPerSet: 21,
  pointsLastSet: 15,
  advancePerGroup: 2,
});

const TEAMS: [string, [string, string, Gender][]][] = [
  [
    "Onda Anomala",
    [
      ["Marco", "Piras", "M"],
      ["Luca", "Melis", "M"],
      ["Giulia", "Sanna", "F"],
      ["Davide", "Cocco", "M"],
    ],
  ],
  [
    "Granchi Volanti",
    [
      ["Elena", "Serra", "F"],
      ["Paolo", "Usai", "M"],
      ["Andrea", "Loi", "M"],
      ["Simone", "Carta", "M"],
    ],
  ],
  [
    "Sabbia nelle Scarpe",
    [
      ["Francesca", "Mura", "F"],
      ["Alessandro", "Pinna", "M"],
      ["Matteo", "Floris", "M"],
      ["Chiara", "Deiana", "F"],
    ],
  ],
  [
    "Colpo di Sole",
    [
      ["Roberto", "Manca", "M"],
      ["Sara", "Fadda", "F"],
      ["Stefano", "Orrù", "M"],
      ["Nicola", "Puddu", "M"],
    ],
  ],
  [
    "Meduse Ribelli",
    [
      ["Valentina", "Congiu", "F"],
      ["Fabio", "Marras", "M"],
      ["Antonio", "Lai", "M"],
      ["Michele", "Atzeni", "M"],
    ],
  ],
  [
    "Ricci di Mare",
    [
      ["Martina", "Porcu", "F"],
      ["Gianluca", "Spano", "M"],
      ["Daniele", "Corona", "M"],
      ["Enrico", "Frau", "M"],
    ],
  ],
];

for (const [name, people] of TEAMS) {
  const teamId = repo.registerTeam(
    tournamentId,
    name,
    "333 0000000",
    people.map(([firstName, lastName, gender]) => ({
      firstName,
      lastName,
      gender,
    })),
  );
  repo.setTeamStatus(teamId, "active");
}

const SINGLES: [string, string, Gender, number][] = [
  ["Laura", "Vacca", "F", 7],
  ["Anna", "Cadeddu", "F", 4],
  ["Pietro", "Zedda", "M", 8],
  ["Giorgio", "Onnis", "M", 6],
  ["Claudio", "Murgia", "M", 5],
  ["Federico", "Angioni", "M", 3],
  ["Emanuele", "Casu", "M", 9],
  ["Riccardo", "Tuveri", "M", 2],
];

for (const [firstName, lastName, gender, skill] of SINGLES) {
  repo.registerSingle(
    tournamentId,
    { firstName, lastName, gender, skill },
    "333 1111111",
  );
}

const gen = repo.generateTeamsFromSingles(tournamentId);
console.log(`Squadre generate dai singoli: ${gen.created} (riserve: ${gen.reserves})`);

repo.generateGroups(tournamentId, 2);
console.log("Gironi creati");

// Gioca metà delle partite di girone per avere classifiche interessanti
const groupMatches = repo
  .listMatches(tournamentId)
  .filter((m) => m.phase === "group");
groupMatches.slice(0, Math.ceil(groupMatches.length / 2)).forEach((m, i) => {
  const aWins = i % 3 !== 0;
  repo.saveScore(
    m.id,
    aWins
      ? [
          { a: 21, b: 14 + (i % 5) },
          { a: 21, b: 10 + (i % 8) },
        ]
      : [
          { a: 21, b: 17 },
          { a: 15, b: 21 },
          { a: 11, b: 15 },
        ],
  );
});
console.log(
  `Giocate ${Math.ceil(groupMatches.length / 2)} partite su ${groupMatches.length}`,
);
console.log(`Database demo pronto: ${dbFile}`);
}

main();
