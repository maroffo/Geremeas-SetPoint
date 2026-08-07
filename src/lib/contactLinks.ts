// ABOUTME: Parser dei numeri di telefono dentro il testo libero dei contatti del torneo
// ABOUTME: Funzione pura, riusa la validazione permissiva di validation.ts e normalizza in E.164

import { validatePhone } from "./validation";

export type ContactSegment =
  | { kind: "text"; value: string }
  | { kind: "phone"; value: string; e164: string };

/**
 * Cifre minime perché una sequenza dentro un testo libero sia considerata un
 * numero: sotto questa soglia si finisce per linkare date ("10.08.2026" sono
 * 8 cifre) e altri numeri di servizio. I fissi italiani più corti (070 123456)
 * arrivano comunque a 9.
 */
const MIN_DIGITS = 9;

/**
 * Sequenza candidata: inizia e finisce con una cifra, con dentro solo i
 * separatori ammessi da validatePhone. Lo spazio è letterale, quindi un a capo
 * chiude sempre il candidato: le righe del testo restano indipendenti.
 */
const CANDIDATE = /\+?\d[\d ().\-]*\d/g;

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Normalizza un numero in E.164 (`+39...`). Senza prefisso internazionale
 * assume l'Italia; `00` iniziale vale come `+`. Null se validatePhone lo
 * rifiuta.
 */
export function toE164(raw: string): string | null {
  const cleaned = validatePhone(raw);
  if (!cleaned) return null;
  const digits = digitsOf(cleaned);
  if (cleaned.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return `+39${digits}`;
}

/** Link WhatsApp: wa.me vuole le sole cifre, senza il `+`. */
export function waLink(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

/**
 * Spezza il testo in segmenti: i numeri riconosciuti diventano segmenti
 * `phone` (col testo originale e la forma E.164), tutto il resto resta testo
 * puro, nell'ordine in cui compare.
 */
export function parseContacts(text: string): ContactSegment[] {
  const segments: ContactSegment[] = [];
  let last = 0;

  for (const match of text.matchAll(CANDIDATE)) {
    const raw = match[0];
    const start = match.index;
    if (digitsOf(raw).length < MIN_DIGITS) continue;
    const e164 = toE164(raw);
    if (!e164) continue;

    if (start > last) segments.push({ kind: "text", value: text.slice(last, start) });
    segments.push({ kind: "phone", value: raw, e164 });
    last = start + raw.length;
  }

  if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
  return segments;
}
