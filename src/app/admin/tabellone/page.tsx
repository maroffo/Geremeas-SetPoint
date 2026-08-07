import { Bracket } from "@/components/Bracket";
import { FormMessages } from "@/components/FormMessages";
import { btnPrimary, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getActiveTournament } from "@/lib/repo";
import { buildTournamentView } from "@/lib/view";
import { generateKnockoutAction, setStatusAction } from "../actions";

export const dynamic = "force-dynamic";

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
  const groupMatchesLeft = view.groups
    .flatMap((g) => g.matches)
    .filter((m) => m.status === "scheduled").length;
  const finalDone = view.podium.first !== null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tabellone finale</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      {tournament.format !== "groups_only" && (
        <Card title="Generazione">
          <p className="mb-3 text-sm text-stone-600">
            {view.groups.length > 0
              ? `Avanzano le prime ${tournament.advance_per_group} di ogni girone, con seeding incrociato dalle classifiche.`
              : "Formato a sola eliminazione: le squadre attive vengono sorteggiate nel tabellone."}
            {groupMatchesLeft > 0 &&
              ` Mancano ancora ${groupMatchesLeft} partite di girone.`}
            {view.knockoutRounds.length > 0 &&
              " Rigenerare cancella il tabellone e i suoi risultati!"}
          </p>
          <form action={generateKnockoutAction}>
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <button
              className={btnPrimary}
              disabled={groupMatchesLeft > 0 && view.groups.length > 0}
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
