import { FormMessages } from "@/components/FormMessages";
import { getActiveTournament } from "@/lib/repo";
import { registerSingleAction } from "../actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";

export default async function RegisterSinglePage({
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

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Iscriviti come singolo</h1>
      <p className="mt-1 mb-6 text-stone-600">
        Non hai una squadra? Nessun problema: il sistema creerà squadre
        bilanciate con tutti gli iscritti singoli. Indica onestamente il tuo
        livello!
      </p>

      <FormMessages
        ok={params.ok === "1"}
        error={params.error ?? null}
        okMessage="Iscrizione registrata! Ti assegneremo a una squadra prima dell'inizio del torneo."
      />

      <form
        action={registerSingleAction}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome *</label>
            <input name="firstName" required maxLength={40} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Cognome *</label>
            <input name="lastName" required maxLength={40} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Sei... *</label>
            <select name="gender" className={inputCls} required>
              <option value="M">Ragazzo</option>
              <option value="F">Ragazza</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Contatto (telefono/email) *
            </label>
            <input name="contact" required maxLength={80} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Quanto sei bravo/a? (1 = principiante, 10 = fenomeno) *
          </label>
          <select name="skill" className={inputCls} defaultValue="5" required>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
                {i === 0 ? " — principiante" : i === 9 ? " — fenomeno" : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-sky-700 px-5 py-2.5 font-semibold text-white hover:bg-sky-600"
        >
          Iscrivimi
        </button>
      </form>
    </div>
  );
}
