import { FormMessages } from "@/components/FormMessages";
import { btnDanger, btnSecondary, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import {
  getActiveTournament,
  listTeams,
  listUnassignedSingles,
  teamPlayers,
} from "@/lib/repo";
import { deletePlayerAction, deleteTeamAction, teamStatusAction } from "../actions";

export const dynamic = "force-dynamic";

const BACK = "/admin/iscrizioni";

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const tournament = getActiveTournament();

  if (!tournament) {
    return <p className="text-stone-600">Crea prima il torneo in Gestione torneo.</p>;
  }

  const teams = listTeams(tournament.id);
  const singles = listUnassignedSingles(tournament.id);

  const statusBadge = (status: string) =>
    status === "active" ? (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
        confermata
      </span>
    ) : status === "pending" ? (
      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
        in attesa
      </span>
    ) : (
      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
        ritirata
      </span>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Iscrizioni</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      <Card title={`Squadre (${teams.length})`}>
        {teams.length === 0 ? (
          <p className="text-sm text-stone-500">Nessuna squadra iscritta.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {teams.map((team) => {
              const players = teamPlayers(team.id);
              return (
                <div key={team.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{team.name}</span>
                    {statusBadge(team.status)}
                    {team.origin === "generated" && (
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                        generata
                      </span>
                    )}
                    {team.contact && (
                      <span className="text-xs text-stone-500">
                        📞 {team.contact}
                      </span>
                    )}
                    <div className="ml-auto flex gap-2">
                      {team.status === "pending" && (
                        <form action={teamStatusAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="status" value="active" />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnSecondary}>✅ Conferma</button>
                        </form>
                      )}
                      {team.status === "active" && (
                        <form action={teamStatusAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="status" value="withdrawn" />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnDanger}>Ritira</button>
                        </form>
                      )}
                      {team.status === "withdrawn" && (
                        <form action={teamStatusAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="status" value="active" />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnSecondary}>Riammetti</button>
                        </form>
                      )}
                      {tournament.status === "registration" && (
                        <form action={deleteTeamAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnDanger}>🗑</button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-stone-600">
                    {players.map((p) => (
                      <span key={p.id} className="mr-3">
                        {p.gender === "F" ? "🙋‍♀️" : "🙋‍♂️"} {p.first_name}{" "}
                        {p.last_name}
                        {p.is_reserve ? " (ris.)" : ""}
                      </span>
                    ))}
                    {!players.some((p) => p.gender === "F") && (
                      <span className="text-red-600">
                        ⚠️ manca una ragazza!
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={`Iscritti singoli (${singles.length})`}>
        {singles.length === 0 ? (
          <p className="text-sm text-stone-500">Nessun iscritto singolo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-500">
                  <th className="py-1 pr-2">Giocatore</th>
                  <th className="py-1 px-2">Genere</th>
                  <th className="py-1 px-2">Bravura</th>
                  <th className="py-1 px-2">Contatto</th>
                  <th className="py-1 px-2">Stato</th>
                  <th className="py-1 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {singles.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="py-1.5 pr-2">
                      {p.first_name} {p.last_name}
                    </td>
                    <td className="py-1.5 px-2">
                      {p.gender === "F" ? "Ragazza" : "Ragazzo"}
                    </td>
                    <td className="py-1.5 px-2">{p.skill}/10</td>
                    <td className="py-1.5 px-2 text-stone-500">{p.contact}</td>
                    <td className="py-1.5 px-2">
                      {p.is_reserve ? "riserva" : "da assegnare"}
                    </td>
                    <td className="py-1.5 px-2">
                      <form action={deletePlayerAction}>
                        <input type="hidden" name="playerId" value={p.id} />
                        <input type="hidden" name="back" value={BACK} />
                        <button className="text-red-600 hover:underline">
                          rimuovi
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
