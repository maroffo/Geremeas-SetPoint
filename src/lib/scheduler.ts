// ABOUTME: Generazione del calendario: distribuisce blocchi di partite su
// ABOUTME: slot stimati (giornate × campi), bilanciando i campi. Funzioni pure.

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

/**
 * Riempie gli slot in ordine (giornata per giornata, orario per orario),
 * blocco dopo blocco. Dentro uno slot le partite vanno su campi diversi;
 * la rotazione del campo di partenza bilancia il carico per campo.
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
  const slots: Array<{ day: DaySlot; index: number }> = [];
  const slotsPerDay: Array<{ date: string; slots: number }> = [];
  for (const day of orderedDays) {
    const span = toMinutes(day.endTime) - toMinutes(day.startTime);
    const count = Math.max(0, Math.floor(span / matchMinutes));
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

  return { assignments, unplacedMatchIds, slotsPerDay };
}
