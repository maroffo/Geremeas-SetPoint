import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "gsp_admin";

function adminPin(): string {
  return process.env.ADMIN_PIN ?? "geremeas";
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
  if (!verifyPin(pin)) return false;
  const store = await cookies();
  store.set(COOKIE_NAME, tokenFor(adminPin()), {
    httpOnly: true,
    sameSite: "lax",
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
  return store.get(COOKIE_NAME)?.value === tokenFor(adminPin());
}

/** Da usare in cima a ogni pagina e server action del pannello admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
