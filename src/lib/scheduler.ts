// ABOUTME: Generazione del calendario: distribuisce blocchi di partite su slot
// ABOUTME: stimati (giornate × campi), bilancia i campi e dà riposo. Funzioni pure.

// Limiti condivisi della durata partita: repo.ts valida gli stessi bound
// alla creazione del torneo, qui si rifiutano input fuori range.
export const MATCH_MINUTES_MIN = 10;
export const MATCH_MINUTES_MAX = 240;

export function isValidMatchMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MATCH_MINUTES_MIN &&
    minutes <= MATCH_MINUTES_MAX
  );
}

export interface DaySlot {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
}

/**
 * Un blocco è un insieme di partite che possono giocarsi in parallelo
 * (squadre tutte diverse: un round di girone o un round di tabellone).
 * I blocchi vanno in ordine: un blocco inizia solo dopo la fine del
 * precedente, così una squadra non è mai in due slot sovrapposti e i
 * round del tabellone rispettano le dipendenze.
 */
export interface ScheduleBlock {
  matchIds: number[];
}

export interface Assignment {
  matchId: number;
  court: string;
  /** YYYY-MM-DDTHH:MM, stimato */
  scheduledAt: string;
}

export interface ScheduleResult {
  assignments: Assignment[];
  /** Partite rimaste fuori per capienza insufficiente. */
  unplacedMatchIds: number[];
  /** Slot per giornata, utile per messaggi di diagnosi. */
  slotsPerDay: Array<{ date: string; slots: number }>;
}

/**
 * Squadre di ogni partita (`matchId → teamId[]`), usata solo per il riposo.
 * Una partita assente dalla mappa (o con squadre ancora ignote, come i round
 * di tabellone non propagati) non genera mai un vincolo di riposo.
 */
export type TeamsByMatch = Map<number, number[]>;

interface Slot {
  day: DaySlot;
  index: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function slotTime(day: DaySlot, index: number, matchMinutes: number): string {
  const minutes = toMinutes(day.startTime) + index * matchMinutes;
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${day.date}T${h}:${m}`;
}

/** Due slot sono attaccati solo se stessa giornata e orari consecutivi. */
function isBackToBack(previous: Slot, current: Slot): boolean {
  return (
    previous.day.date === current.day.date && previous.index + 1 === current.index
  );
}

function playsInBusySlot(
  matchId: number,
  busy: Set<number>,
  teamsByMatch: TeamsByMatch,
): boolean {
  const teams = teamsByMatch.get(matchId);
  if (!teams) return false;
  return teams.some((teamId) => busy.has(teamId));
}

/**
 * Sposta in fondo alla coda del blocco le partite le cui squadre hanno appena
 * giocato: riposo a costo zero, il numero di partite piazzate non cambia.
 * L'ordine relativo dei due gruppi resta quello del blocco.
 */
function restedFirst(
  queue: number[],
  busy: Set<number>,
  teamsByMatch: TeamsByMatch,
): void {
  const rested: number[] = [];
  const backToBack: number[] = [];
  for (const matchId of queue) {
    if (playsInBusySlot(matchId, busy, teamsByMatch)) backToBack.push(matchId);
    else rested.push(matchId);
  }
  queue.splice(0, queue.length, ...rested, ...backToBack);
}

/**
 * Slot minimi per finire: il blocco corrente più tutti quelli dopo. I blocchi
 * non condividono uno slot, quindi il fabbisogno si somma blocco per blocco.
 */
function slotsNeeded(
  queueLength: number,
  blocks: ScheduleBlock[],
  fromBlock: number,
  courtCount: number,
): number {
  let needed = Math.ceil(queueLength / courtCount);
  for (let i = fromBlock + 1; i < blocks.length; i++)
    needed += Math.ceil(blocks[i].matchIds.length / courtCount);
  return needed;
}

/**
 * Una passata di riempimento: slot in ordine, blocco dopo blocco, campi
 * diversi dentro lo stesso slot con rotazione del campo di partenza.
 *
 * Con `withRest` le squadre non giocano due slot attaccati: prima si
 * riordina la coda del blocco (riposo gratis), e solo se il back-to-back
 * resta si salta uno slot, a patto che ne avanzino abbastanza per tutte le
 * partite rimaste. Il riposo non deve mai costare partite non collocate.
 */
function placeBlocks(
  slots: Slot[],
  courts: string[],
  matchMinutes: number,
  blocks: ScheduleBlock[],
  teamsByMatch: TeamsByMatch,
  withRest: boolean,
): { assignments: Assignment[]; unplacedMatchIds: number[] } {
  const assignments: Assignment[] = [];
  const unplacedMatchIds: number[] = [];
  const teamsBySlot = new Map<number, Set<number>>();
  let slotCursor = 0;

  for (let b = 0; b < blocks.length; b++) {
    const queue = [...blocks[b].matchIds];
    while (queue.length > 0) {
      if (slotCursor >= slots.length) {
        unplacedMatchIds.push(...queue);
        break;
      }
      const busy =
        withRest && slotCursor > 0 && isBackToBack(slots[slotCursor - 1], slots[slotCursor])
          ? teamsBySlot.get(slotCursor - 1)
          : undefined;
      if (busy && busy.size > 0) {
        restedFirst(queue, busy, teamsByMatch);
        const stillBackToBack = queue
          .slice(0, courts.length)
          .some((id) => playsInBusySlot(id, busy, teamsByMatch));
        const spare =
          slots.length - slotCursor >
          slotsNeeded(queue.length, blocks, b, courts.length);
        if (stillBackToBack && spare) {
          slotCursor++; // slot cuscinetto: lo slot precedente resta vuoto
          continue;
        }
      }
      const { day, index } = slots[slotCursor];
      const batch = queue.splice(0, courts.length);
      const playing = new Set<number>();
      batch.forEach((matchId, j) => {
        assignments.push({
          matchId,
          court: courts[(slotCursor + j) % courts.length],
          scheduledAt: slotTime(day, index, matchMinutes),
        });
        for (const teamId of teamsByMatch.get(matchId) ?? []) playing.add(teamId);
      });
      teamsBySlot.set(slotCursor, playing);
      slotCursor++;
    }
  }

  // Con la capienza esaurita anche i blocchi successivi restano fuori:
  // raccogli tutti gli id senza assegnazione per un conteggio onesto.
  const placed = new Set(assignments.map((a) => a.matchId));
  for (const block of blocks) {
    for (const id of block.matchIds) {
      if (!placed.has(id) && !unplacedMatchIds.includes(id)) {
        unplacedMatchIds.push(id);
      }
    }
  }

  return { assignments, unplacedMatchIds };
}

/**
 * Riempie gli slot in ordine (giornata per giornata, orario per orario),
 * blocco dopo blocco. Dentro uno slot le partite vanno su campi diversi;
 * la rotazione del campo di partenza bilancia il carico per campo.
 *
 * `teamsByMatch` serve a dare riposo tra due slot attaccati. Doppia passata
 * come rete di sicurezza: se la passata con riposo lascia fuori più partite
 * di quella senza, vince quella senza. Il riposo non costa mai una partita.
 */
export function buildSchedule(
  days: DaySlot[],
  courts: string[],
  matchMinutes: number,
  blocks: ScheduleBlock[],
  teamsByMatch: TeamsByMatch,
): ScheduleResult {
  if (days.length === 0) throw new Error("Definisci almeno una giornata");
  if (courts.length === 0) throw new Error("Definisci almeno un campo");
  if (!isValidMatchMinutes(matchMinutes))
    throw new Error(
      `La durata di una partita va da ${MATCH_MINUTES_MIN} a ${MATCH_MINUTES_MAX} minuti`,
    );

  const orderedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const slots: Slot[] = [];
  const slotsPerDay: Array<{ date: string; slots: number }> = [];
  for (const day of orderedDays) {
    const span = toMinutes(day.endTime) - toMinutes(day.startTime);
    const count = Math.max(0, Math.floor(span / matchMinutes));
    slotsPerDay.push({ date: day.date, slots: count });
    for (let i = 0; i < count; i++) slots.push({ day, index: i });
  }

  const withRest = placeBlocks(
    slots,
    courts,
    matchMinutes,
    blocks,
    teamsByMatch,
    true,
  );
  if (withRest.unplacedMatchIds.length === 0) return { ...withRest, slotsPerDay };

  const withoutRest = placeBlocks(
    slots,
    courts,
    matchMinutes,
    blocks,
    teamsByMatch,
    false,
  );
  const best =
    withoutRest.unplacedMatchIds.length < withRest.unplacedMatchIds.length
      ? withoutRest
      : withRest;
  return { ...best, slotsPerDay };
}
