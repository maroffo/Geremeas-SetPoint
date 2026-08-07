import type { StandingRow } from "@/lib/standings";

export function StandingsTable({
  standings,
  teamNames,
  highlight = 0,
}: {
  standings: StandingRow[];
  teamNames: Map<number, string>;
  highlight?: number; // quante posizioni evidenziare (qualificate)
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-500">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Squadra</th>
            <th className="py-1 px-2 text-center" title="Punti classifica">
              Pt
            </th>
            <th className="py-1 px-2 text-center" title="Giocate">
              G
            </th>
            <th className="py-1 px-2 text-center" title="Vinte">
              V
            </th>
            <th className="py-1 px-2 text-center" title="Perse">
              P
            </th>
            <th className="py-1 px-2 text-center" title="Set vinti/persi">
              Set
            </th>
            <th className="py-1 px-2 text-center" title="Punti fatti/subiti">
              Punti
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => (
            <tr
              key={row.teamId}
              className={`border-b border-stone-100 ${
                i < highlight ? "bg-emerald-50 font-medium" : ""
              }`}
            >
              <td className="py-1.5 pr-2 text-stone-500">{i + 1}</td>
              <td className="py-1.5 pr-2">
                {teamNames.get(row.teamId) ?? "?"}
              </td>
              <td className="py-1.5 px-2 text-center font-semibold">
                {row.points}
              </td>
              <td className="py-1.5 px-2 text-center">{row.played}</td>
              <td className="py-1.5 px-2 text-center">{row.wins}</td>
              <td className="py-1.5 px-2 text-center">{row.losses}</td>
              <td className="py-1.5 px-2 text-center">
                {row.setsWon}-{row.setsLost}
              </td>
              <td className="py-1.5 px-2 text-center">
                {row.pointsWon}-{row.pointsLost}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
