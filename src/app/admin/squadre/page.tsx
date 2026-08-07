import { FormMessages } from "@/components/FormMessages";
import { btnPrimary, Card, inputCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import {
  getActiveTournament,
  listActiveTeams,
  listPlayersByTeam,
  listUnassignedSingles,
} from "@/lib/repo";
import { generateTeamsAction, movePlayerAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage({
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

  const teams = listActiveTeams(tournament.id);
  const playersByTeam = listPlayersByTeam(tournament.id);
  const singles = listUnassignedSingles(tournament.id);
  const unassigned = singles.filter((p) => !p.is_reserve);
  const reserves = singles.filter((p) => p.is_reserve);
  const canEdit = tournament.status === "registration";

  const teamOptions = (
    <>
      <option value="">— nessuna squadra —</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </>
  );

  const moveForm = (playerId: number, currentTeam: number | null) =>
    canEdit ? (
      <form action={movePlayerAction} className="inline-flex items-center gap-1">
        <input type="hidden" name="playerId" value={playerId} />
        <select
          name="teamId"
          defaultValue={currentTeam ?? ""}
          className={`${inputCls} py-1 text-xs`}
        >
          {teamOptions}
        </select>
        <button className="text-xs text-sky-700 hover:underline">sposta</button>
      </form>
    ) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Squadre</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      {canEdit && (
        <Card title="Generazione automatica dai singoli">
          <p className="mb-3 text-sm text-stone-600">
            {unassigned.length} singoli da assegnare (
            {unassigned.filter((p) => p.gender === "F").length} ragazze). Il
            sistema crea squadre da {tournament.team_size} bilanciate per
            bravura, con almeno una ragazza ciascuna. Puoi rigenerare finché
            non crei i gironi: le squadre già generate vengono sciolte e
            ricomposte.
          </p>
          <form action={generateTeamsAction}>
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <button className={btnPrimary}>
              🎲 Genera squadre dai singoli
            </button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team) => {
          const players = playersByTeam.get(team.id) ?? [];
          const skillTotal = players.reduce((s, p) => s + (p.skill ?? 0), 0);
          const hasSkill = players.some((p) => p.skill !== null);
          return (
            <Card key={team.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-semibold">{team.name}</h3>
                <span className="text-xs text-stone-500">
                  {team.origin === "generated" ? "generata" : "iscritta"}
                  {hasSkill && ` · bravura tot. ${skillTotal}`}
                </span>
              </div>
              <ul className="space-y-1 text-sm">
                {players.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {p.gender === "F" ? "🙋‍♀️" : "🙋‍♂️"} {p.first_name}{" "}
                      {p.last_name}
                      {p.skill !== null && (
                        <span className="text-stone-400"> · {p.skill}/10</span>
                      )}
                      {p.is_reserve ? (
                        <span className="text-stone-400"> (ris.)</span>
                      ) : null}
                    </span>
                    {p.skill !== null && moveForm(p.id, p.team_id)}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {(unassigned.length > 0 || reserves.length > 0) && (
        <Card title="Singoli non assegnati">
          <ul className="space-y-1 text-sm">
            {[...unassigned, ...reserves].map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {p.gender === "F" ? "🙋‍♀️" : "🙋‍♂️"} {p.first_name}{" "}
                  {p.last_name}
                  <span className="text-stone-400"> · {p.skill}/10</span>
                  {p.is_reserve ? (
                    <span className="ml-1 rounded bg-stone-100 px-1.5 text-xs">
                      riserva
                    </span>
                  ) : null}
                </span>
                {moveForm(p.id, null)}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
