import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "gsp_admin";

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

function tokenFor(pin: string): string {
  return createHash("sha256").update(`gsp:${pin}`).digest("hex");
}

export function verifyPin(pin: string): boolean {
  const a = Buffer.from(tokenFor(pin));
  const b = Buffer.from(tokenFor(adminPin()));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function loginAdmin(pin: string): Promise<boolean> {
  if (!verifyPin(pin)) {
    // Rallenta e traccia i tentativi falliti: con un PIN ad alta entropia
    // rende il brute force online impraticabile.
    console.warn("Login admin fallito");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return false;
  }
  const store = await cookies();
  store.set(COOKIE_NAME, tokenFor(adminPin()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return true;
}

export async function logoutAdmin(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return false;
  // Se ADMIN_PIN manca in produzione nessuno è admin: qui si ridirige al
  // login invece di rispondere 500, l'errore esplode (voluto) sul login.
  let expected: string;
  try {
    expected = tokenFor(adminPin());
  } catch {
    return false;
  }
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Da usare in cima a ogni pagina e server action del pannello admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
