import { formatSchedule, formatSets, setsWon, type MatchView } from "@/lib/view";

export function MatchLine({ match }: { match: MatchView }) {
  const played = match.status !== "scheduled";
  const won = setsWon(match);
  const schedule = formatSchedule(match);

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <div className="flex-1 text-sm">
        <span
          className={
            played && match.winner === match.team_a ? "font-bold" : ""
          }
        >
          {match.teamAName}
        </span>
        <span className="text-stone-400"> vs </span>
        <span
          className={
            played && match.winner === match.team_b ? "font-bold" : ""
          }
        >
          {match.teamBName}
        </span>
        {match.status === "forfeit" && (
          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
            forfait
          </span>
        )}
      </div>
      {played ? (
        <div className="text-sm">
          <span className="font-semibold">
            {won.a}-{won.b}
          </span>
          <span className="ml-2 text-xs text-stone-500">
            ({formatSets(match)})
          </span>
        </div>
      ) : (
        <div className="text-xs text-sky-700">{schedule || "da definire"}</div>
      )}
    </div>
  );
}
