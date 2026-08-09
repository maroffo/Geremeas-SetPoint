// ABOUTME: Generazione del calendario su slot partita + pausa fissa tra incontri
// ABOUTME: distribuisce i round sui campi, preserva l'ordine e segnala la capienza

// Limiti condivisi della durata partita: repo.ts valida gli stessi bound
// alla creazione del torneo, qui si rifiutano input fuori range.
export const MATCH_MINUTES_MIN = 10;
export const MATCH_MINUTES_MAX = 240;
export const MATCH_BREAK_MINUTES = 5;

export function isValidMatchMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MATCH_MINUTES_MIN &&
    minutes <= MATCH_MINUTES_MAX
  );
}

export function matchIntervalMinutes(matchMinutes: number): number {
  return matchMinutes + MATCH_BREAK_MINUTES;
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
 * precedente, così una squadra non è mai in due partite sovrapposte e i
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

interface Slot {
  day: DaySlot;
  index: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function slotStart(day: DaySlot, index: number, matchMinutes: number): string {
  const minutes =
    toMinutes(day.startTime) + index * matchIntervalMinutes(matchMinutes);
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function slotTime(day: DaySlot, index: number, matchMinutes: number): string {
  return `${day.date}T${slotStart(day, index, matchMinutes)}`;
}

/**
 * Conta gli incontri che finiscono entro la finestra. La pausa serve tra due
 * inizi consecutivi, non dopo l'ultima partita della giornata.
 */
function slotCount(day: DaySlot, matchMinutes: number): number {
  const span = toMinutes(day.endTime) - toMinutes(day.startTime);
  if (span < matchMinutes) return 0;
  return (
    Math.floor(
      (span - matchMinutes) / matchIntervalMinutes(matchMinutes),
    ) + 1
  );
}

/** Somma minuti a una data/ora naive preservandone la semantica di parete. */
function addNaiveMinutes(value: string, minutes: number): string {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const shifted = new Date(
    Date.UTC(year, month - 1, day, hour, minute + minutes),
  );
  return shifted.toISOString().slice(0, 16);
}

/** Primo istante utile dopo una partita, pausa fissa inclusa. */
export function nextMatchStart(
  scheduledAt: string,
  matchMinutes: number,
): string {
  if (!isValidMatchMinutes(matchMinutes))
    throw new Error(
      `La durata di una partita va da ${MATCH_MINUTES_MIN} a ${MATCH_MINUTES_MAX} minuti`,
    );
  return addNaiveMinutes(
    scheduledAt,
    matchIntervalMinutes(matchMinutes),
  );
}

/**
 * Giornate ridotte agli slot con inizio uguale o successivo a `notBefore`
 * ("YYYY-MM-DDTHH:MM"). La griglia resta ancorata all'inizio originale della
 * giornata: con partite da 40 minuti gli slot sono 18:00, 18:45, 19:30…
 */
export function availableDaysFrom(
  days: DaySlot[],
  matchMinutes: number,
  notBefore: string,
): DaySlot[] {
  if (!isValidMatchMinutes(matchMinutes))
    throw new Error(
      `La durata di una partita va da ${MATCH_MINUTES_MIN} a ${MATCH_MINUTES_MAX} minuti`,
    );
  const kept: DaySlot[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const count = slotCount(day, matchMinutes);
    let index = 0;
    while (
      index < count &&
      slotTime(day, index, matchMinutes) < notBefore
    )
      index++;
    if (index >= count) continue;
    kept.push(
      index === 0
        ? day
        : { ...day, startTime: slotStart(day, index, matchMinutes) },
    );
  }
  return kept;
}

/**
 * Riempie gli slot in ordine, blocco dopo blocco. Dentro uno slot le partite
 * vanno su campi diversi; la rotazione del campo di partenza bilancia il
 * carico. Due slot consecutivi sono già separati dalla pausa fissa di 5 minuti.
 */
export function buildSchedule(
  days: DaySlot[],
  courts: string[],
  matchMinutes: number,
  blocks: ScheduleBlock[],
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
    const count = slotCount(day, matchMinutes);
    slotsPerDay.push({ date: day.date, slots: count });
    for (let i = 0; i < count; i++) slots.push({ day, index: i });
  }

  const assignments: Assignment[] = [];
  const unplacedMatchIds: number[] = [];
  let slotCursor = 0;

  for (const block of blocks) {
    const queue = [...block.matchIds];
    while (queue.length > 0) {
      if (slotCursor >= slots.length) {
        unplacedMatchIds.push(...queue);
        break;
      }
      const { day, index } = slots[slotCursor];
      const batch = queue.splice(0, courts.length);
      batch.forEach((matchId, j) => {
        assignments.push({
          matchId,
          court: courts[(slotCursor + j) % courts.length],
          scheduledAt: slotTime(day, index, matchMinutes),
        });
      });
      slotCursor++;
    }
  }

  // Con la capienza esaurita anche i blocchi successivi restano fuori.
  const placed = new Set(assignments.map((a) => a.matchId));
  for (const block of blocks)
    for (const id of block.matchIds)
      if (!placed.has(id) && !unplacedMatchIds.includes(id))
        unplacedMatchIds.push(id);

  return { assignments, unplacedMatchIds, slotsPerDay };
}
