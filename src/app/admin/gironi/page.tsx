import { FormMessages } from "@/components/FormMessages";
import { StandingsTable } from "@/components/StandingsTable";
import { btnPrimary, Card, inputCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getActiveTournament, listActiveTeams } from "@/lib/repo";
import { buildTournamentView } from "@/lib/view";
import { generateGroupsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminGroupsPage({
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

  const activeTeams = listActiveTeams(tournament.id);
  const view = buildTournamentView(tournament);
  const maxGroups = Math.max(1, Math.floor(activeTeams.length / 2));
  const suggested = Math.max(1, Math.round(activeTeams.length / 4));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gironi</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      <Card title="Genera i gironi">
        <p className="mb-3 text-sm text-stone-600">
          {activeTeams.length} squadre attive. Le squadre vengono sorteggiate e
          distribuite a serpentina; il calendario round robin di ogni girone
          viene creato automaticamente.
          {view.groups.length > 0 &&
            " Rigenerare cancella gironi e risultati esistenti!"}
        </p>
        <form
          action={generateGroupsAction}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="tournamentId" value={tournament.id} />
          <div>
            <label className="mb-1 block text-sm font-medium">
              Numero di gironi
            </label>
            <select
              name="numGroups"
              defaultValue={Math.min(suggested, maxGroups)}
              className={`${inputCls} w-32`}
            >
              {Array.from({ length: maxGroups }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <button className={btnPrimary}>
            {view.groups.length > 0 ? "⚠️ Rigenera gironi" : "Genera gironi"}
          </button>
        </form>
      </Card>

      {view.groups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
