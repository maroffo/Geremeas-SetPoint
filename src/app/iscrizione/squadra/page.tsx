import { FormMessages } from "@/components/FormMessages";
import { getActiveTournament } from "@/lib/repo";
import { registerTeamAction } from "../actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";

export default async function RegisterTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const tournament = getActiveTournament();

  if (!tournament || tournament.status !== "registration") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold">Iscrizioni chiuse</h1>
        <p className="mt-2 text-stone-600">
          Le iscrizioni per il torneo non sono aperte al momento.
        </p>
      </div>
    );
  }

  const rows = tournament.team_size + 2;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Iscrivi la tua squadra</h1>
      <p className="mt-1 mb-6 text-stone-600">
        Squadre da {tournament.team_size} giocatori (più fino a 2 riserve).{" "}
        <strong>Almeno una ragazza per squadra!</strong>
      </p>

      <FormMessages
        ok={params.ok === "1"}
        error={params.error ?? null}
        okMessage="Squadra iscritta! L'organizzatore la confermerà a breve."
      />

      <form
        action={registerTeamAction}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Nome squadra *
            </label>
            <input
              name="teamName"
              required
              maxLength={40}
              className={inputCls}
              placeholder="Es. Onda Anomala"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Contatto capitano (telefono/email) *
            </label>
            <input
              name="contact"
              required
              maxLength={80}
              className={inputCls}
              placeholder="333 1234567"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Giocatori</div>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-stone-500">
                {i < tournament.team_size ? `Titolare ${i + 1}` : "Riserva"}
              </span>
              <input
                name={`p${i}_first`}
                required={i < tournament.team_size}
                maxLength={40}
                placeholder="Nome"
                className={`${inputCls} flex-1 min-w-28`}
              />
              <input
                name={`p${i}_last`}
                required={i < tournament.team_size}
                maxLength={40}
                placeholder="Cognome"
                className={`${inputCls} flex-1 min-w-28`}
              />
              <select
                name={`p${i}_gender`}
                className={`${inputCls} w-auto`}
                defaultValue={i === 0 ? "F" : "M"}
              >
                <option value="F">Ragazza</option>
                <option value="M">Ragazzo</option>
              </select>
            </div>
          ))}
        </div>

        <button
          type="submit"
          className="rounded-lg bg-sky-700 px-5 py-2.5 font-semibold text-white hover:bg-sky-600"
        >
          Iscrivi la squadra
        </button>
      </form>
    </div>
  );
}
