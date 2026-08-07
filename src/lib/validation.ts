// ABOUTME: Validazioni condivise dei form: contatto telefonico e requisito d'età
// ABOUTME: Funzioni pure, senza dipendenze da DB o Next, testabili in isolamento

export interface AgeRequirement {
  minAge: number | null;
  maxAge: number | null;
}

/**
 * Valida un numero di telefono in modo permissivo: prefisso + opzionale,
 * cifre, spazi, trattini, punti e parentesi, con almeno 8 e al massimo
 * 15 cifre. Ritorna il numero ripulito o null se non valido.
 */
export function validatePhone(raw: string): string | null {
  const value = raw.trim();
  // Il limite sul totale (non solo sulle cifre) evita payload arbitrari di
  // soli caratteri di formattazione: il maxLength del form è client-only.
  if (!value || value.length > 32) return null;
  if (!/^\+?[0-9 ().\-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return value;
}

export function hasAgeRequirement(req: AgeRequirement): boolean {
  return req.minAge != null || req.maxAge != null;
}

/**
 * Descrizione compatta del requisito: "almeno 35 anni", "al massimo 17 anni",
 * "tra 16 e 18 anni" (estremi inclusi). Null se il torneo non ha vincoli.
 */
export function agePhrase(req: AgeRequirement): string | null {
  const { minAge, maxAge } = req;
  if (minAge != null && maxAge != null) return `tra ${minAge} e ${maxAge} anni`;
  if (minAge != null) return `almeno ${minAge} anni`;
  if (maxAge != null) return `al massimo ${maxAge} anni`;
  return null;
}
