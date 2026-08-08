// ABOUTME: Autenticazione a sessioni server-side: cookie con token opaco, tabella sessions con sha256(token).
// ABOUTME: Due ruoli riconosciuti dal PIN inserito (admin, scorekeeper) e lockout in-memory sui login falliti.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export type Role = "admin" | "scorekeeper";

const COOKIE_NAME = "gsp_session";
// Cookie della vecchia autenticazione (sha256 del PIN): non viene più letto,
// ma è un valore derivato dal segreto, quindi lo si toglie dal browser.
const LEGACY_COOKIE_NAME = "gsp_admin";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_LOGIN_DELAY_MS = 1000;
const LOCKOUT_FAILS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function adminPin(): string {
  const pin = process.env.ADMIN_PIN;
  if (pin) return pin;
  // In produzione niente PIN di default: meglio negare l'accesso che
  // esporre il pannello admin con una credenziale nota.
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PIN non impostato: accesso admin disabilitato");
  }
  return "geremeas";
}

/** PIN del segnapunti: segreto opzionale, se manca il ruolo è disattivo. */
function scorekeeperPin(): string | null {
  return process.env.SCOREKEEPER_PIN || null;
}

// Confronto a tempo costante sugli hash: sono sempre 32 byte, quindi non
// trapela nemmeno la lunghezza del PIN configurato.
function samePin(input: string, expected: string): boolean {
  return timingSafeEqual(sha256(input), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function hashToken(token: string): string {
  return sha256(token).toString("hex");
}

/** Ruolo a cui corrisponde il PIN inserito, null se non ne riconosce nessuno. */
export function roleForPin(pin: string): Role | null {
  if (!pin) return null;
  // Nessuno short circuit: entrambi i confronti vengono sempre eseguiti, così
  // il tempo di risposta non dice quale dei due segreti è stato sfiorato.
  const matchesAdmin = samePin(pin, adminPin());
  const scorekeeper = scorekeeperPin();
  const matchesScorekeeper = scorekeeper !== null && samePin(pin, scorekeeper);
  if (matchesAdmin) return "admin";
  return matchesScorekeeper ? "scorekeeper" : null;
}

// ---------------------------------------------------------------------------
// Sessioni
// ---------------------------------------------------------------------------

interface SessionRow {
  id: number;
  role: Role;
  expires_at: number;
}

/** Crea la sessione e restituisce il token da mettere nel cookie (mai salvato). */
export function createSession(role: Role, now: number = Date.now()): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions (token_hash, role, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), role, now, now + SESSION_MS);
  return token;
}

/** Ruolo della sessione, null se il token è ignoto o scaduto (riga rimossa). */
export function validateSession(
  token: string,
  now: number = Date.now(),
): Role | null {
  const row = db
    .prepare("SELECT id, role, expires_at FROM sessions WHERE token_hash = ?")
    .get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
    return null;
  }
  return row.role;
}

/** Revoca vera: la riga sparisce, il token nel cookie non vale più nulla. */
export function revokeSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

/** Spurgo pigro delle sessioni scadute, eseguito a ogni login riuscito. */
export function purgeExpiredSessions(now: number = Date.now()): number {
  return db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now)
    .changes;
}

// ---------------------------------------------------------------------------
// Lockout dei tentativi di login
// ---------------------------------------------------------------------------

// In memoria, non su DB: il servizio gira a istanza singola (--max-instances 1),
// quindi il contatore è quello vero. Con più istanze andrebbe spostato sul DB.
const loginAttempts = new Map<string, { fails: number; until: number }>();

/** IP del client dietro il proxy di Cloud Run (primo valore di x-forwarded-for). */
async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "sconosciuto";
}

function forgetOldAttempts(now: number): void {
  for (const [ip, attempt] of loginAttempts) {
    if (attempt.until <= now) loginAttempts.delete(ip);
  }
}

function isLockedOut(ip: string, now: number): boolean {
  const attempt = loginAttempts.get(ip);
  return attempt !== undefined && attempt.fails >= LOCKOUT_FAILS && now < attempt.until;
}

function registerFailure(ip: string, now: number): void {
  const attempt = loginAttempts.get(ip);
  // La finestra di conteggio e quella di blocco coincidono: i fallimenti
  // scadono insieme al blocco che hanno provocato.
  const fails = attempt && now < attempt.until ? attempt.fails + 1 : 1;
  loginAttempts.set(ip, { fails, until: now + LOCKOUT_MS });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Login / logout / guardie
// ---------------------------------------------------------------------------

/** Apre la sessione se il PIN è riconosciuto; restituisce il ruolo ottenuto. */
export async function loginAdmin(pin: string): Promise<Role | null> {
  const now = Date.now();
  const ip = await clientIp();
  forgetOldAttempts(now);

  if (isLockedOut(ip, now)) {
    // Il tentativo non viene contato: il blocco non si autoalimenta, dura
    // sempre 15 minuti dall'ultimo tentativo davvero valutato.
    console.warn(`Login bloccato per troppi tentativi falliti (${ip})`);
    await wait(FAILED_LOGIN_DELAY_MS);
    return null;
  }

  const role = roleForPin(pin);
  if (!role) {
    registerFailure(ip, now);
    // Rallenta e traccia i tentativi falliti: con un PIN ad alta entropia
    // rende il brute force online impraticabile.
    console.warn(`Login fallito (${ip})`);
    await wait(FAILED_LOGIN_DELAY_MS);
    return null;
  }

  loginAttempts.delete(ip);
  purgeExpiredSessions(now);
  const token = createSession(role, now);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MS / 1000,
    path: "/",
  });
  store.delete(LEGACY_COOKIE_NAME);
  return role;
}

export async function logoutAdmin(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) revokeSession(token);
  store.delete(COOKIE_NAME);
  store.delete(LEGACY_COOKIE_NAME);
}

/** Ruolo di chi sta facendo la richiesta, null se non autenticato. */
export async function currentRole(): Promise<Role | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSession(token);
}

/** Da usare in cima a ogni pagina e server action di gestione del torneo. */
export async function requireAdmin(): Promise<void> {
  const role = await currentRole();
  if (role === "admin") return;
  // Un segnapunti autenticato non ha niente da fare sul login: lo si rimanda
  // all'unica pagina che gli compete.
  redirect(role ? "/admin/partite" : "/admin/login");
}

/** Guardia dei punteggi: passano admin e segnapunti. Restituisce il ruolo. */
export async function requireScorer(): Promise<Role> {
  const role = await currentRole();
  if (role) return role;
  redirect("/admin/login");
}
