// ABOUTME: Orologio del torneo: "adesso" e "oggi" nel fuso Europe/Rome, come
// ABOUTME: stringhe naive zero-padded confrontabili lessicalmente con scheduled_at.

/**
 * Gli orari del torneo (`matches.scheduled_at`, le giornate) sono stringhe
 * naive "YYYY-MM-DDTHH:MM" intese come ora di parete a Roma, mentre il server
 * gira in UTC. Per confrontarle con l'istante corrente serve la stessa forma:
 * qui l'ora di Roma si legge con Intl (che conosce il DST) e si compone
 * zero-padded, così il confronto resta lessicale sulle stringhe e non passa
 * mai da `new Date(<stringa naive>)`, che le interpreterebbe come UTC.
 */
const romeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Ora di parete di Roma come "YYYY-MM-DDTHH:MM".
 * `at` è iniettabile: i test fissano l'istante, il resto del codice non lo passa.
 */
export function nowInRome(at: Date = new Date()): string {
  const parts: Record<string, string> = {};
  for (const part of romeFormat.formatToParts(at)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Data di parete di Roma come "YYYY-MM-DD". */
export function todayInRome(at: Date = new Date()): string {
  return nowInRome(at).slice(0, 10);
}
