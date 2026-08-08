import { FormMessages } from "@/components/FormMessages";
import { btnSecondary, Card, inputCls } from "@/components/ui";
import { roundLabel } from "@/lib/bracket";
import { requireScorer } from "@/lib/auth";
import {
  getActiveTournament,
  listCourts,
  listDays,
  type TournamentRow,
} from "@/lib/repo";
import {
  buildTournamentView,
  formatSchedule,
  formatSets,
  setsWon,
  type MatchView,
} from "@/lib/view";
import {
  clearScoreAction,
  forfeitAction,
  generateScheduleAction,
  saveScoreAction,
  scheduleMatchAction,
} from "../actions";

export const dynamic = "force-dynamic";

const BACK = "/admin/partite";

function MatchAdmin({
  match,
  tournament,
  canManage,
}: {
  match: MatchView;
  tournament: TournamentRow;
  canManage: boolean;
}) {
  const ready = match.team_a !== null && match.team_b !== null;
  const played = match.status !== "scheduled";
  const won = setsWon(match);
  const setCount = tournament.best_of;

  return (
    <div className="border-b border-stone-100 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">
          <span className={played && match.winner === match.team_a ? "font-bold" : ""}>
            {match.teamAName}
          </span>{" "}
          <span className="text-stone-400">vs</span>{" "}
          <span className={played && match.winner === match.team_b ? "font-bold" : ""}>
            {match.teamBName}
          </span>
        </span>
        {played && (
          <span className="text-sm font-semibold">
            {won.a}-{won.b}{" "}
            <span className="font-normal text-stone-500">
              ({formatSets(match)})
            </span>
          </span>
        )}
        {match.status === "forfeit" && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
            forfait
          </span>
        )}
        <span className="ml-auto text-xs text-stone-500">
          {formatSchedule(match)}
        </span>
      </div>

      {ready && (
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <form
            action={saveScoreAction}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="back" value={BACK} />
            {Array.from({ length: setCount }, (_, i) => {
              const s = match.sets[i];
              return (
                <span key={i} className="flex items-center gap-1">
                  <input
                    name={`set${i + 1}a`}
                    type="number"
                    min={0}
                    defaultValue={s?.points_a ?? ""}
                    placeholder="A"
                    className={`${inputCls} w-16 py-1`}
                  />
                  <span className="text-stone-400">-</span>
                  <input
                    name={`set${i + 1}b`}
                    type="number"
                    min={0}
                    defaultValue={s?.points_b ?? ""}
                    placeholder="B"
                    className={`${inputCls} w-16 py-1`}
                  />
                </span>
              );
            })}
            <button className={btnSecondary}>💾 Risultato</button>
          </form>

          {canManage && (
            <form
              action={scheduleMatchAction}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="back" value={BACK} />
              <input
                name="court"
                defaultValue={match.court ?? ""}
                placeholder="Campo"
                className={`${inputCls} w-24 py-1`}
              />
              <input
                name="scheduledAt"
                type="datetime-local"
                defaultValue={match.scheduled_at ?? ""}
                className={`${inputCls} py-1`}
              />
              <button className={btnSecondary}>📅</button>
            </form>
          )}

          <div className="flex items-center gap-2 text-xs">
            {!played && (
              <>
                <form action={forfeitAction}>
                  <input type="hidden" name="matchId" value={match.id} />
                  <input type="hidden" name="teamId" value={match.team_a!} />
                  <input type="hidden" name="back" value={BACK} />
                  <button className="text-red-600 hover:underline">
                    forfait {match.teamAName}
                  </button>
                </form>
                <form action={forfeitAction}>
                  <input type="hidden" name="matchId" value={match.id} />
                  <input type="hidden" name="teamId" value={match.team_b!} />
                  <input type="hidden" name="back" value={BACK} />
                  <button className="text-red-600 hover:underline">
                    forfait {match.teamBName}
                  </button>
                </form>
              </>
            )}
            {played && (
              <form action={clearScoreAction}>
                <input type="hidden" name="matchId" value={match.id} />
                <input type="hidden" name="back" value={BACK} />
                <button className="text-stone-500 hover:underline">
                  annulla risultato
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Vista aperta anche al segnapunti: i punteggi si inseriscono da qui.
  const role = await requireScorer();
  const canManage = role === "admin";
  const params = await searchParams;
  const tournament = getActiveTournament();

  if (!tournament) {
    return <p className="text-stone-600">Crea prima il torneo in Gestione torneo.</p>;
  }

  const view = buildTournamentView(tournament);
  const hasMatches =
    view.groups.some((g) => g.matches.length > 0) ||
    view.knockoutRounds.length > 0;

  const days = listDays(tournament.id);
  const courts = listCourts(tournament.id);
  const canSchedule = hasMatches && days.length > 0 && courts.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Partite</h1>
        {canSchedule && canManage && (
          <form action={generateScheduleAction} className="ml-auto">
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <button className={btnSecondary}>
              🗓 Genera calendario (orari stimati)
            </button>
          </form>
        )}
      </div>
      {hasMatches && !canSchedule && canManage && (
        <p className="text-sm text-stone-500">
          Per generare il calendario definisci giornate e campi in{" "}
          <em>Gestione torneo</em>.
        </p>
      )}
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      {!hasMatches && (
        <p className="text-stone-600">
          Nessuna partita in calendario: genera prima i gironi (o il
          tabellone).
        </p>
      )}

      {view.groups.map((g) => (
        <Card key={g.group.id} title={g.group.name}>
          {g.matches.map((m) => (
            <MatchAdmin
              key={m.id}
              match={m}
              tournament={tournament}
              canManage={canManage}
            />
          ))}
        </Card>
      ))}

      {view.knockoutRounds.map((matches, i) => (
        <Card
          key={i}
          title={`${roundLabel(i + 1, view.totalKnockoutRounds)} — eliminazione diretta`}
        >
          {matches.map((m) => (
            <MatchAdmin
              key={m.id}
              match={m}
              tournament={tournament}
              canManage={canManage}
            />
          ))}
          {i + 1 === view.totalKnockoutRounds && view.thirdPlace && (
            <>
              <div className="mt-2 text-sm font-semibold text-stone-500">
                Finale 3º/4º posto
              </div>
              <MatchAdmin
                match={view.thirdPlace}
                tournament={tournament}
                canManage={canManage}
              />
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
