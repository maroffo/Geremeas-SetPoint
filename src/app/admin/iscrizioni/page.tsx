import { FormMessages } from "@/components/FormMessages";
import { btnDanger, btnSecondary, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import {
  getActiveTournament,
  listTeams,
  listUnassignedSingles,
  teamPlayers,
} from "@/lib/repo";
import {
  createTeamAction,
  deletePlayerAction,
  deleteTeamAction,
  teamStatusAction,
  updatePlayerAction,
  updateTeamContactAction,
} from "../actions";

const contactInputCls =
  "w-36 rounded border border-stone-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none";

function ContactEditor({
  action,
  idField,
  id,
  contact,
}: {
  action: (formData: FormData) => Promise<void>;
  idField: string;
  id: number;
  contact: string | null;
}) {
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name={idField} value={id} />
      <input type="hidden" name="back" value={BACK} />
      <span aria-hidden>📞</span>
      <input
        name="contact"
        type="tel"
        defaultValue={contact ?? ""}
        placeholder="333 1234567"
        maxLength={32}
        className={contactInputCls}
      />
      <button className="text-xs text-sky-700 hover:underline">salva</button>
    </form>
  );
}

export const dynamic = "force-dynamic";

const BACK = "/admin/iscrizioni";

export default async function AdminRegistrationsPage({
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

  const teams = listTeams(tournament.id);
  const singles = listUnassignedSingles(tournament.id);

  const statusBadge = (status: string) =>
    status === "active" ? (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
        confermata
      </span>
    ) : status === "pending" ? (
      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
        in attesa
      </span>
    ) : (
      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
        ritirata
      </span>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Iscrizioni</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />

      <Card title={`Squadre (${teams.length})`}>
        {teams.length === 0 ? (
          <p className="text-sm text-stone-500">Nessuna squadra iscritta.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {teams.map((team) => {
              const players = teamPlayers(team.id);
              return (
                <div key={team.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{team.name}</span>
                    {statusBadge(team.status)}
                    {team.origin === "generated" && (
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                        generata
                      </span>
                    )}
                    <ContactEditor
                      action={updateTeamContactAction}
                      idField="teamId"
                      id={team.id}
                      contact={team.contact}
                    />
                    <div className="ml-auto flex gap-2">
                      {team.status === "pending" && (
                        <form action={teamStatusAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="status" value="active" />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnSecondary}>✅ Conferma</button>
                        </form>
                      )}
                      {team.status === "active" && (
                        <form action={teamStatusAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="status" value="withdrawn" />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnDanger}>Ritira</button>
                        </form>
                      )}
                      {team.status === "withdrawn" && (
                        <form action={teamStatusAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="status" value="active" />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnSecondary}>Riammetti</button>
                        </form>
                      )}
                      {tournament.status === "registration" && (
                        <form action={deleteTeamAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="back" value={BACK} />
                          <button className={btnDanger}>🗑</button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-stone-600">
                    {players.map((p) => (
                      <span key={p.id} className="mr-3">
                        {p.gender === "F" ? "🙋‍♀️" : "🙋‍♂️"} {p.first_name}{" "}
                        {p.last_name}
                        {p.is_reserve ? " (ris.)" : ""}
                      </span>
                    ))}
                    {!players.some((p) => p.gender === "F") && (
                      <span className="text-red-600">
                        ⚠️ manca una donna!
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <form
          action={createTeamAction}
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3"
        >
          <input type="hidden" name="tournamentId" value={tournament.id} />
          <input type="hidden" name="back" value={BACK} />
          <input
            name="teamName"
            required
            maxLength={40}
            placeholder="Nome squadra"
            className={`${contactInputCls} w-44`}
          />
          <input
            name="contact"
            type="tel"
            maxLength={32}
            placeholder="Telefono (opzionale)"
            className={contactInputCls}
          />
          <button className={btnSecondary}>+ Crea squadra</button>
        </form>
      </Card>

      <Card title={`Iscritti singoli (${singles.length})`}>
        {singles.length === 0 ? (
          <p className="text-sm text-stone-500">Nessun iscritto singolo.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {singles.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-2 py-2 text-sm"
              >
                <form
                  action={updatePlayerAction}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="playerId" value={p.id} />
                  <input type="hidden" name="back" value={BACK} />
                  <input
                    name="firstName"
                    required
                    maxLength={40}
                    defaultValue={p.first_name}
                    placeholder="Nome"
                    className={`${contactInputCls} w-28`}
                  />
                  <input
                    name="lastName"
                    required
                    maxLength={40}
                    defaultValue={p.last_name}
                    placeholder="Cognome"
                    className={`${contactInputCls} w-28`}
                  />
                  <span className="text-xs text-stone-500">
                    {p.gender === "F" ? "Donna" : "Uomo"}
                  </span>
                  <select
                    name="skill"
                    defaultValue={p.skill ?? 5}
                    className={contactInputCls}
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}/10
                      </option>
                    ))}
                  </select>
                  <span aria-hidden>📞</span>
                  <input
                    name="contact"
                    type="tel"
                    defaultValue={p.contact ?? ""}
                    placeholder="333 1234567"
                    maxLength={32}
                    className={contactInputCls}
                  />
                  <button className="text-xs text-sky-700 hover:underline">
                    salva
                  </button>
                </form>
                <span className="text-xs text-stone-500">
                  {p.is_reserve ? "riserva" : "da assegnare"}
                </span>
                <form action={deletePlayerAction} className="ml-auto">
                  <input type="hidden" name="playerId" value={p.id} />
                  <input type="hidden" name="back" value={BACK} />
                  <button className="text-xs text-red-600 hover:underline">
                    rimuovi
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
