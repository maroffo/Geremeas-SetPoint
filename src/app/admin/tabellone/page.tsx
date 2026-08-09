import { Bracket } from "@/components/Bracket";
import { FormMessages } from "@/components/FormMessages";
import { btnPrimary, Card } from "@/components/ui";
import { usesSmallTournamentFormula } from "@/lib/bracket";
import { requireAdmin } from "@/lib/auth";
import { getActiveTournament, listActiveTeams } from "@/lib/repo";
import { buildTournamentView } from "@/lib/view";
import { generateKnockoutAction, setStatusAction } from "../actions";

export const dynamic = "force-dynamic";

function smallTournamentDescription(teamCount: number): string {
  if (teamCount === 5) {
    return "Girone unico: le prime 3 accedono alle semifinali; 4ª e 5ª disputano un quarto di finale e la vincente affronta la 1ª. L'altra semifinale è 2ª-3ª.";
  }
  if (teamCount === 4) {
    return "Girone unico: tutte accedono alle semifinali, con incroci 1ª-4ª e 2ª-3ª.";
  }
  if (teamCount === 3) {
    return "Girone unico: la 1ª accede direttamente alla finale, mentre 2ª e 3ª disputano la semifinale.";
  }
  return "Girone unico: 1ª e 2ª disputano direttamente la finale.";
}

export default async function AdminBracketPage({
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

  const view = buildTournamentView(tournament);
  const activeTeams = listActiveTeams(tournament.id);
  const activeTeamCount = activeTeams.length;
  const activeTeamIds = new Set(activeTeams.map((team) => team.id));
  const groupMatchesLeft = view.groups
    .flatMap((g) => g.matches)
    .filter((m) => m.status === "scheduled").length;
  const groupTeamCount = view.groups.reduce(
    (total, group) => total + group.teams.length,
    0,
  );
  const isKnockoutOnly = tournament.format === "knockout_only";
  const requiresSmallRoundRobin =
    tournament.format === "groups_knockout" &&
    usesSmallTournamentFormula(activeTeamCount);
  const hasCurrentGroupRoster =
    groupTeamCount === activeTeamCount &&
    view.groups
      .flatMap((group) => group.teams)
      .every((team) => activeTeamIds.has(team.id));
  const staleGroupRoster =
    tournament.format === "groups_knockout" &&
    view.groups.length > 0 &&
    !hasCurrentGroupRoster;
  const smallTournamentSetupRequired =
    requiresSmallRoundRobin &&
    (view.groups.length !== 1 || !hasCurrentGroupRoster);
  const groupSetupRequired =
    staleGroupRoster || smallTournamentSetupRequired;
  const smallTournament = requiresSmallRoundRobin && !groupSetupRequired;
  const finalDone = view.podium.first !== null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tabellone finale</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      {tournament.format !== "groups_only" && (
        <Card title="Generazione">
          <p className="mb-3 text-sm text-stone-600">
            {isKnockoutOnly
              ? "Formato a sola eliminazione: le squadre attive vengono sorteggiate nel tabellone."
              : smallTournamentSetupRequired
                ? `Con ${activeTeamCount} squadre è previsto un girone unico all'italiana: generalo o rigeneralo nella sezione Gironi prima del tabellone.`
                : staleGroupRoster
                  ? "Le squadre attive sono cambiate: rigenera i gironi prima del tabellone."
                  : view.groups.length > 0
                    ? smallTournament
                      ? smallTournamentDescription(groupTeamCount)
                      : `Avanzano le prime ${tournament.advance_per_group} di ogni girone, con seeding incrociato dalle classifiche.`
                    : "Non ci sono gironi: le squadre attive vengono sorteggiate nel tabellone."}
            {!isKnockoutOnly && groupMatchesLeft > 0 &&
              ` Mancano ancora ${groupMatchesLeft} partite di girone.`}
            {view.knockoutRounds.length > 0 &&
              " Rigenerare cancella il tabellone e i suoi risultati!"}
          </p>
          <form action={generateKnockoutAction}>
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <button
              className={btnPrimary}
              disabled={
                groupSetupRequired ||
                (!isKnockoutOnly &&
                  groupMatchesLeft > 0 &&
                  view.groups.length > 0)
              }
            >
              {view.knockoutRounds.length > 0
                ? "⚠️ Rigenera tabellone"
                : "Genera tabellone"}
            </button>
          </form>
        </Card>
      )}

      {view.knockoutRounds.length > 0 && (
        <Card title="Tabellone">
          <Bracket
            rounds={view.knockoutRounds}
            thirdPlace={view.thirdPlace}
            totalRounds={view.totalKnockoutRounds}
          />
        </Card>
      )}

      {finalDone && tournament.status !== "finished" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              🏆 Vincitore:{" "}
              <strong>{view.teamNames.get(view.podium.first!)}</strong> — puoi
              chiudere il torneo.
            </div>
            <form action={setStatusAction}>
              <input type="hidden" name="tournamentId" value={tournament.id} />
              <input type="hidden" name="status" value="finished" />
              <button className={btnPrimary}>🏁 Chiudi il torneo</button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
