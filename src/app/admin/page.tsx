import { FormMessages } from "@/components/FormMessages";
import { btnPrimary, btnSecondary, Card, inputCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import {
  getActiveTournament,
  hasPoster,
  listCourts,
  listDays,
  listTeams,
  listUnassignedSingles,
  type CourtRow,
  type DayRow,
  type TournamentRow,
} from "@/lib/repo";
import {
  addCourtAction,
  addDayAction,
  createTournamentAction,
  deleteCourtAction,
  deleteDayAction,
  setStatusAction,
  updateTournamentAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  registration: "Iscrizioni aperte",
  groups: "Fase a gironi",
  knockout: "Eliminazione diretta",
  finished: "Concluso",
};

function SettingsForm({
  tournament,
  posterUploaded,
}: {
  tournament: TournamentRow | null;
  posterUploaded: boolean;
}) {
  const t = tournament;
  return (
    <form
      action={t ? updateTournamentAction : createTournamentAction}
      className="grid gap-4 sm:grid-cols-2"
    >
      {t && <input type="hidden" name="tournamentId" value={t.id} />}
      <div>
        <label className="mb-1 block text-sm font-medium">Nome torneo</label>
        <input
          name="name"
          required
          defaultValue={t?.name ?? "Torneo di Geremeas"}
          className={`${inputCls} w-full`}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Anno</label>
        <input
          name="year"
          type="number"
          required
          defaultValue={t?.year ?? new Date().getFullYear()}
          className={`${inputCls} w-full`}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Giocatori per squadra
        </label>
        <select
          name="teamSize"
          defaultValue={t?.team_size ?? 4}
          className={`${inputCls} w-full`}
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}x{n}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Formato</label>
        <select
          name="format"
          defaultValue={t?.format ?? "groups_knockout"}
          className={`${inputCls} w-full`}
        >
          <option value="groups_knockout">Gironi + eliminazione diretta</option>
          <option value="groups_only">Solo gironi (campionato)</option>
          <option value="knockout_only">Solo eliminazione diretta</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Set per partita</label>
        <select
          name="bestOf"
          defaultValue={t?.best_of ?? 3}
          className={`${inputCls} w-full`}
        >
          <option value="1">Set secco</option>
          <option value="3">Al meglio di 3</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Punti a set</label>
          <input
            name="pointsPerSet"
            type="number"
            min={7}
            max={30}
            defaultValue={t?.points_per_set ?? 21}
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Punti 3º set
          </label>
          <input
            name="pointsLastSet"
            type="number"
            min={7}
            max={30}
            defaultValue={t?.points_last_set ?? 15}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Età minima
          </label>
          <input
            name="minAge"
            type="number"
            min={1}
            max={120}
            placeholder="nessuna"
            defaultValue={t?.min_age ?? ""}
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Età massima
          </label>
          <input
            name="maxAge"
            type="number"
            min={1}
            max={120}
            placeholder="nessuna"
            defaultValue={t?.max_age ?? ""}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Qualificate per girone
        </label>
        <select
          name="advancePerGroup"
          defaultValue={t?.advance_per_group ?? 2}
          className={`${inputCls} w-full`}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Durata media partita (minuti)
        </label>
        <input
          name="matchMinutes"
          type="number"
          min={10}
          max={240}
          defaultValue={t?.match_minutes ?? 40}
          className={`${inputCls} w-full`}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium">
          Contatti per gli iscritti (mostrati sul sito)
        </label>
        <textarea
          name="contactInfo"
          rows={2}
          maxLength={500}
          placeholder={"Laura 348 8804992\nManuel 328 6267017"}
          defaultValue={t?.contact_info ?? ""}
          className={`${inputCls} w-full`}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium">
          Locandina (JPEG/PNG/WebP, max 2MB)
          {posterUploaded && (
            <span className="ml-2 font-normal text-emerald-700">
              ✓ caricata,{" "}
              <a href="/locandina" target="_blank" className="underline">
                vedi
              </a>{" "}
              (scegli un file per sostituirla)
            </span>
          )}
        </label>
        <input
          name="poster"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-stone-600"
        />
      </div>
      <div className="flex items-end">
        <button className={btnPrimary}>
          {t ? "Salva impostazioni" : "Crea torneo"}
        </button>
      </div>
    </form>
  );
}

function DaysAndCourts({
  tournament,
  days,
  courts,
}: {
  tournament: TournamentRow;
  days: DayRow[];
  courts: CourtRow[];
}) {
  const dateLabel = (d: string) =>
    new Date(`${d}T00:00`).toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "long",
    });
  return (
    <Card title="Giornate e campi">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium">Giornate di gioco</div>
          {days.length === 0 && (
            <p className="mb-2 text-sm text-stone-500">
              Nessuna giornata: aggiungile per generare il calendario.
            </p>
          )}
          <ul className="mb-3 space-y-1">
            {days.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <span>
                  {dateLabel(d.date)} · {d.start_time}–{d.end_time}
                </span>
                <form action={deleteDayAction}>
                  <input type="hidden" name="dayId" value={d.id} />
                  <button className="text-red-600 hover:underline">
                    rimuovi
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addDayAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <input name="date" type="date" required className={`${inputCls} py-1`} />
            <input
              name="startTime"
              type="time"
              required
              defaultValue="18:00"
              className={`${inputCls} w-24 py-1`}
            />
            <input
              name="endTime"
              type="time"
              required
              defaultValue="20:30"
              className={`${inputCls} w-24 py-1`}
            />
            <button className={btnSecondary}>+ Giornata</button>
          </form>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Campi</div>
          {courts.length === 0 && (
            <p className="mb-2 text-sm text-stone-500">
              Nessun campo: aggiungine almeno uno.
            </p>
          )}
          <ul className="mb-3 space-y-1">
            {courts.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span>{c.name}</span>
                <form action={deleteCourtAction}>
                  <input type="hidden" name="courtId" value={c.id} />
                  <button className="text-red-600 hover:underline">
                    rimuovi
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addCourtAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <input
              name="name"
              required
              maxLength={30}
              placeholder="Es. Campo 1"
              className={`${inputCls} w-40 py-1`}
            />
            <button className={btnSecondary}>+ Campo</button>
          </form>
        </div>
      </div>
    </Card>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const tournament = getActiveTournament() ?? null;

  const teams = tournament ? listTeams(tournament.id) : [];
  const singles = tournament
    ? listUnassignedSingles(tournament.id).filter((p) => !p.is_reserve)
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gestione torneo</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      {tournament && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">
                {tournament.name} {tournament.year}
              </div>
              <div className="text-sm text-stone-500">
                Stato:{" "}
                <span className="font-medium text-sky-700">
                  {STATUS_LABELS[tournament.status]}
                </span>
                {" · "}
                {teams.filter((t) => t.status === "active").length} squadre
                attive
                {" · "}
                {teams.filter((t) => t.status === "pending").length} in attesa
                {" · "}
                {singles.length} singoli da assegnare
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {tournament.status !== "registration" && (
                <form action={setStatusAction}>
                  <input type="hidden" name="tournamentId" value={tournament.id} />
                  <input type="hidden" name="status" value="registration" />
                  <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">
                    ↩︎ Riapri iscrizioni
                  </button>
                </form>
              )}
              {tournament.status !== "finished" && (
                <form action={setStatusAction}>
                  <input type="hidden" name="tournamentId" value={tournament.id} />
                  <input type="hidden" name="status" value="finished" />
                  <button className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100">
                    🏁 Chiudi torneo
                  </button>
                </form>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card
        title={
          tournament
            ? "Impostazioni"
            : "Crea l'edizione di quest'anno"
        }
      >
        <SettingsForm
          tournament={tournament}
          posterUploaded={tournament ? hasPoster(tournament.id) : false}
        />
        {tournament && tournament.status !== "registration" && (
          <p className="mt-3 text-xs text-stone-500">
            Attenzione: cambiare formato o regole a torneo avviato non modifica
            gironi e partite già generati.
          </p>
        )}
      </Card>

      {tournament && (
        <DaysAndCourts
          tournament={tournament}
          days={listDays(tournament.id)}
          courts={listCourts(tournament.id)}
        />
      )}

      {tournament && (
        <Card title="Come funziona">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
            <li>
              Con le <strong>iscrizioni aperte</strong>, squadre e singoli si
              iscrivono dal sito; conferma le squadre in{" "}
              <em>Iscrizioni</em>.
            </li>
            <li>
              Genera le squadre dai singoli in <em>Squadre</em> (puoi
              rigenerare e fare scambi finché non crei i gironi).
            </li>
            <li>
              Crea i gironi in <em>Gironi</em>: le iscrizioni si chiudono e
              parte il calendario.
            </li>
            <li>
              Inserisci i risultati in <em>Partite</em>; classifiche sempre
              aggiornate.
            </li>
            <li>
              A gironi finiti genera il <em>Tabellone</em> a eliminazione
              diretta, fino alla finale.
            </li>
          </ol>
        </Card>
      )}
    </div>
  );
}
