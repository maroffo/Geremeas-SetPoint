import { roundLabel } from "@/lib/bracket";
import { formatSets, setsWon, type MatchView } from "@/lib/view";

function BracketMatch({ match }: { match: MatchView }) {
  const played = match.status !== "scheduled";
  const won = setsWon(match);

  const side = (teamId: number | null, name: string, sets: number) => (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-1.5 ${
        played && match.winner !== null && match.winner === teamId
          ? "font-bold text-emerald-800"
          : teamId === null
            ? "text-stone-400"
            : ""
      }`}
    >
      <span className="truncate text-sm">{name}</span>
      {played && <span className="text-sm">{sets}</span>}
    </div>
  );

  return (
    <div className="w-52 rounded-lg border border-stone-200 bg-white shadow-sm">
      {side(match.team_a, match.teamAName, won.a)}
      <div className="border-t border-stone-100" />
      {side(match.team_b, match.teamBName, won.b)}
      {played && match.sets.length > 0 && (
        <div className="border-t border-stone-100 px-3 py-1 text-xs text-stone-500">
          {formatSets(match)}
        </div>
      )}
    </div>
  );
}

export function Bracket({
  rounds,
  thirdPlace,
  totalRounds,
}: {
  rounds: MatchView[][];
  thirdPlace: MatchView | null;
  totalRounds: number;
}) {
  if (rounds.length === 0) return null;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-6">
        {rounds.map((matches, i) => (
          <div key={i} className="flex flex-col justify-around gap-4">
            <div className="text-center text-xs font-semibold uppercase text-stone-500">
              {roundLabel(i + 1, totalRounds)}
            </div>
            {matches.map((m) => (
              <BracketMatch key={m.id} match={m} />
            ))}
          </div>
        ))}
        {thirdPlace && (
          <div className="flex flex-col justify-end gap-4">
            <div className="text-center text-xs font-semibold uppercase text-stone-500">
              Finale 3º posto
            </div>
            <BracketMatch match={thirdPlace} />
          </div>
        )}
      </div>
    </div>
  );
}
