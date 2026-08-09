// ABOUTME: Pagina pubblica di una squadra: rosa, partite e classifica del girone
// ABOUTME: 404 se la squadra non è confermata o non è del torneo in corso (scoping nel repo)

import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MatchLine } from "@/components/MatchLine";
import { StandingsTable } from "@/components/StandingsTable";
import { Card } from "@/components/ui";
import { getTeamPublicView } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Solo id canonici: "1e1" o " 10" sono lo stesso record con un altro URL.
  const view = /^\d+$/.test(id) ? getTeamPublicView(Number(id)) : null;
  if (!view) notFound();

  const teamNames = new Map(
    view.group?.standings.map((s) => [s.teamId, s.teamName]) ?? [],
  );

  return (
    <div className="space-y-6">
      <AutoRefresh />

      <div className="rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 p-6 text-white shadow">
        <Link href="/" className="text-sm text-sky-100 hover:text-amber-300">
          ← {view.tournamentName} {view.tournamentYear}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{view.teamName}</h1>
        {view.group && <p className="mt-1 text-sky-100">{view.group.name}</p>}
      </div>

      <Card title={`Giocatori (${view.players.length})`}>
        {view.players.length === 0 ? (
          <p className="text-sm text-stone-500">Rosa non ancora definita.</p>
        ) : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {view.players.map((p, i) => (
              <li key={i}>
                {p.gender === "F" ? "👩" : "👨"} {p.firstName} {p.lastName}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Partite">
        {view.matches.length === 0 ? (
          <p className="text-sm text-stone-500">
            Nessuna partita in calendario per ora.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-stone-500">
              Gli orari sono indicativi: fanno fede l&apos;ordine delle partite e
              il campo.
            </p>
            <div className="divide-y divide-stone-100">
              {view.matches.map((m) => (
                <MatchLine key={m.id} match={m} />
              ))}
            </div>
          </>
        )}
      </Card>

      {view.group && (
        <Card title={`Classifica ${view.group.name}`}>
          <StandingsTable
            standings={view.group.standings}
            teamNames={teamNames}
            linkTeams
          />
        </Card>
      )}
    </div>
  );
}
