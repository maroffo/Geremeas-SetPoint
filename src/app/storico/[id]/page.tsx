// ABOUTME: Vista read-only di un'edizione conclusa: podio, tabellone e classifiche dei gironi
// ABOUTME: 404 se il torneo non esiste o non è finished (controllo in buildArchiveView, prima della vista)

import Link from "next/link";
import { notFound } from "next/navigation";
import { Bracket } from "@/components/Bracket";
import { MatchLine } from "@/components/MatchLine";
import { StandingsTable } from "@/components/StandingsTable";
import { Card } from "@/components/ui";
import { buildArchiveView } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function ArchivedTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Solo id canonici: "1e1" o " 10" sono lo stesso record con un altro URL.
  const view = /^\d+$/.test(id) ? buildArchiveView(Number(id)) : null;
  if (!view) notFound();

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 p-6 text-white shadow">
        <Link
          href="/storico"
          className="text-sm text-sky-100 hover:text-amber-300"
        >
          ← Albo d&apos;oro
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {view.name} {view.year}
        </h1>
        <p className="mt-1 text-sky-100">Edizione conclusa</p>
      </div>

      {view.podium.first && (
        <Card>
          <div className="py-4 text-center">
            <div className="text-5xl">🏆</div>
            <h2 className="mt-2 text-2xl font-bold">
              {view.teamNames.get(view.podium.first)}
            </h2>
            <p className="text-stone-500">
              vince il {view.name} {view.year}
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
            <Card key={g.name} title={g.name}>
              {/* Niente linkTeams: /squadra/[id] risponde solo per il torneo in corso. */}
              <StandingsTable standings={g.standings} teamNames={view.teamNames} />
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
    </div>
  );
}
