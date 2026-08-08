// ABOUTME: Archivio pubblico delle edizioni concluse: anno, nome e podio
// ABOUTME: Elenca solo i tornei finished (scoping in query, listFinishedTournaments)

import Link from "next/link";
import { Card } from "@/components/ui";
import { listFinishedTournaments } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function StoricoPage() {
  const editions = listFinishedTournaments();

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 p-6 text-white shadow">
        <Link href="/" className="text-sm text-sky-100 hover:text-amber-300">
          ← Torneo in corso
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Albo d&apos;oro</h1>
        <p className="mt-1 text-sky-100">
          Le edizioni concluse del Geremeas SetPoint
        </p>
      </div>

      {editions.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-600">
            Nessuna edizione conclusa: l&apos;archivio si apre alla fine del
            primo torneo.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {editions.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/storico/${e.id}`}
                  className="text-lg font-semibold text-sky-700 hover:underline"
                >
                  {e.name} {e.year}
                </Link>
                {e.podium.first && (
                  <span className="text-sm">🏆 {e.podium.first}</span>
                )}
              </div>
              {(e.podium.second || e.podium.third) && (
                <div className="mt-1 flex flex-wrap gap-4 text-xs text-stone-500">
                  {e.podium.second && <span>🥈 {e.podium.second}</span>}
                  {e.podium.third && <span>🥉 {e.podium.third}</span>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
