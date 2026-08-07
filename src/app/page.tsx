import Link from "next/link";
import { Bracket } from "@/components/Bracket";
import { MatchLine } from "@/components/MatchLine";
import { StandingsTable } from "@/components/StandingsTable";
import {
  getActiveTournament,
  hasPoster,
  listTeams,
  listUnassignedSingles,
} from "@/lib/repo";
import { agePhrase } from "@/lib/validation";
import { buildTournamentView, formatSchedule } from "@/lib/view";

export const dynamic = "force-dynamic";

function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export default function HomePage() {
  const tournament = getActiveTournament();

  if (!tournament) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="text-6xl">🏖️</div>
        <h1 className="mt-4 text-2xl font-bold">
          Il torneo non è ancora iniziato
        </h1>
        <p className="mt-2 text-stone-600">
          L&apos;organizzatore non ha ancora creato l&apos;edizione di
          quest&apos;anno. Torna a trovarci presto!
        </p>
      </div>
    );
  }

  const view = buildTournamentView(tournament);
  const ageReq = agePhrase({
    minAge: tournament.min_age,
    maxAge: tournament.max_age,
  });
  const poster = hasPoster(tournament.id);
  const teams = listTeams(tournament.id);
  const activeTeams = teams.filter((t) => t.status === "active");
  const pendingTeams = teams.filter((t) => t.status === "pending");
  const singles = listUnassignedSingles(tournament.id).filter(
    (p) => !p.is_reserve,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 p-6 text-white shadow">
        <h1 className="text-2xl font-bold">
          {tournament.name} {tournament.year}
        </h1>
        <p className="mt-1 text-sky-100">
          Squadre {tournament.team_size}x{tournament.team_size} · al meglio di{" "}
          {tournament.best_of} set · set a {tournament.points_per_set}
          {ageReq && ` · riservato a chi ha ${ageReq}`}
        </p>
        {tournament.status === "registration" && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/iscrizione/squadra"
              className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-stone-900 hover:bg-amber-300"
            >
              Iscrivi la tua squadra
            </Link>
            <Link
              href="/iscrizione/singolo"
              className="rounded-lg bg-white/15 px-4 py-2 font-semibold hover:bg-white/25"
            >
              Non hai una squadra? Iscriviti singolo
            </Link>
          </div>
        )}
      </div>

      {(poster || tournament.contact_info) && (
        <Card title="Locandina e contatti">
          <div className="flex flex-col gap-4 sm:flex-row">
            {poster && (
              <a href="/locandina" target="_blank" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/locandina"
                  alt={`Locandina ${tournament.name}`}
                  className="w-full max-w-xs rounded-lg border border-stone-200 shadow-sm"
                />
              </a>
            )}
            {tournament.contact_info && (
              <div className="whitespace-pre-line text-sm text-stone-700">
                <div className="mb-1 font-medium">Per info e iscrizioni:</div>
                {tournament.contact_info}
              </div>
            )}
          </div>
        </Card>
      )}

      {tournament.status === "finished" && view.podium.first && (
        <Card>
          <div className="py-4 text-center">
            <div className="text-5xl">🏆</div>
            <h2 className="mt-2 text-2xl font-bold">
              {view.teamNames.get(view.podium.first)}
            </h2>
            <p className="text-stone-500">
              vince il {tournament.name} {tournament.year}!
            </p>
            <div className="mt-4 flex justify-center gap-8 text-sm">
              {view.podium.second && (
                <div>🥈 {view.teamNames.get(view.podium.second)}</div>
              )}
              {view.podium.third && (
                <div>🥉 {view.teamNames.get(view.podium.third)}</div>
              )}
            </div>
          </div>
        </Card>
      )}

      {view.upcoming.length > 0 && tournament.status !== "finished" && (
        <Card title="Prossime partite">
          <p className="mb-2 text-xs text-stone-500">
            Gli orari sono indicativi: fanno fede l&apos;ordine delle partite e
            il campo.
          </p>
          <div className="divide-y divide-stone-100">
            {view.upcoming.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-sm"
              >
                <span>
                  {m.teamAName} <span className="text-stone-400">vs</span>{" "}
                  {m.teamBName}
                </span>
                <span className="text-xs text-sky-700">
                  {formatSchedule(m) || "orario da definire"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {view.knockoutRounds.length > 0 && (
        <Card title="Tabellone finale">
          <Bracket
            rounds={view.knockoutRounds}
            thirdPlace={view.thirdPlace}
            totalRounds={view.totalKnockoutRounds}
          />
        </Card>
      )}

      {view.groups.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {view.groups.map((g) => (
            <Card key={g.group.id} title={g.group.name}>
              <StandingsTable
                standings={g.standings}
                teamNames={view.teamNames}
                highlight={
                  tournament.format === "groups_only"
                    ? 0
                    : tournament.advance_per_group
                }
              />
              <h3 className="mt-4 mb-1 text-sm font-semibold text-stone-600">
                Partite
              </h3>
              <div className="divide-y divide-stone-100">
                {g.matches.map((m) => (
                  <MatchLine key={m.id} match={m} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tournament.status === "registration" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title={`Squadre iscritte (${activeTeams.length})`}>
            {activeTeams.length === 0 && pendingTeams.length === 0 ? (
              <p className="text-sm text-stone-500">
                Ancora nessuna squadra iscritta: siate i primi!
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {activeTeams.map((t) => (
                  <li key={t.id}>✅ {t.name}</li>
                ))}
                {pendingTeams.map((t) => (
                  <li key={t.id} className="text-stone-500">
                    ⏳ {t.name} (in attesa di conferma)
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Iscritti singoli (${singles.length})`}>
            <p className="text-sm text-stone-600">
              {singles.length === 0
                ? "Nessun iscritto singolo per ora."
                : `${singles.length} giocatori in attesa di essere assegnati a una squadra dal sistema.`}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
