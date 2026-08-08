// ABOUTME: Test dell'autenticazione a sessioni: token nel cookie e sha256 sul DB,
// ABOUTME: ruoli admin/segnapunti, revoca al logout, scadenza e lockout per IP.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Solo il tipo: l'import viene cancellato, il modulo si carica più sotto con
// DATABASE_PATH già impostato.
import type { Role } from "../auth";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-auth-"));
process.env.DATABASE_PATH = path.join(dbDir, "test.db");

const { fakeStore, fakeHeaders, redirectMock } = vi.hoisted(() => {
  const data = new Map<string, string>();
  const fakeStore = {
    data,
    get(name: string) {
      const value = data.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: vi.fn((name: string, value: string, _opts?: Record<string, unknown>) => {
      data.set(name, value);
    }),
    delete: vi.fn((name: string) => {
      data.delete(name);
    }),
  };
  const fakeHeaders = {
    ip: "10.0.0.1" as string | null,
    get(name: string) {
      return name === "x-forwarded-for" ? fakeHeaders.ip : null;
    },
  };
  return { fakeStore, fakeHeaders, redirectMock: vi.fn() };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => fakeStore),
  headers: vi.fn(async () => fakeHeaders),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const auth = await import("../auth");
const { db } = await import("../db");

const COOKIE = "gsp_session";
const ADMIN_PIN = "segretissimo";
const SCORE_PIN = "punti-a1b2";
const DAY_MS = 24 * 60 * 60 * 1000;

interface StoredSession {
  token_hash: string;
  role: string;
  created_at: number;
  expires_at: number;
}

function sessions(): StoredSession[] {
  return db.prepare("SELECT * FROM sessions").all() as StoredSession[];
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Login col ritardo anti brute force già consumato (timer finti sempre attivi). */
async function login(pin: string): Promise<Role | null> {
  const pending = auth.loginAdmin(pin);
  await vi.advanceTimersByTimeAsync(1000);
  return pending;
}

function cookieToken(): string {
  const token = fakeStore.data.get(COOKIE);
  if (!token) throw new Error("nessun cookie di sessione");
  return token;
}

// Ogni test parte da un IP diverso: la mappa del lockout vive nel modulo e
// sopravvive ai test, isolarla per IP è più onesto che azzerarla dall'esterno.
let ipCounter = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T10:00:00Z"));
  db.prepare("DELETE FROM sessions").run();
  fakeStore.data.clear();
  fakeStore.set.mockClear();
  fakeStore.delete.mockClear();
  redirectMock.mockClear();
  fakeHeaders.ip = `10.0.0.${++ipCounter}`;
  vi.stubEnv("ADMIN_PIN", ADMIN_PIN);
  vi.stubEnv("SCOREKEEPER_PIN", SCORE_PIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

describe("roleForPin", () => {
  it("riconosce il PIN admin e quello del segnapunti", () => {
    expect(auth.roleForPin(ADMIN_PIN)).toBe("admin");
    expect(auth.roleForPin(SCORE_PIN)).toBe("scorekeeper");
    expect(auth.roleForPin("sbagliato")).toBeNull();
    expect(auth.roleForPin("")).toBeNull();
  });

  it("senza SCOREKEEPER_PIN il ruolo è disattivo, non un errore", () => {
    vi.stubEnv("SCOREKEEPER_PIN", undefined);
    expect(auth.roleForPin(SCORE_PIN)).toBeNull();
    expect(auth.roleForPin(ADMIN_PIN)).toBe("admin");
  });

  it("con SCOREKEEPER_PIN vuoto il ruolo resta disattivo", () => {
    vi.stubEnv("SCOREKEEPER_PIN", "");
    expect(auth.roleForPin("")).toBeNull();
    expect(auth.roleForPin(SCORE_PIN)).toBeNull();
  });

  it("in produzione senza ADMIN_PIN nega l'accesso (fail closed)", () => {
    vi.stubEnv("ADMIN_PIN", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => auth.roleForPin("geremeas")).toThrow(/ADMIN_PIN/);
  });

  it("fuori produzione senza ADMIN_PIN usa il default di sviluppo", () => {
    vi.stubEnv("ADMIN_PIN", undefined);
    expect(auth.roleForPin("geremeas")).toBe("admin");
  });
});

describe("loginAdmin", () => {
  it("col PIN admin apre una sessione admin", async () => {
    expect(await login(ADMIN_PIN)).toBe("admin");
    expect(await auth.currentRole()).toBe("admin");
    expect(await auth.requireScorer()).toBe("admin");
  });

  it("col PIN del segnapunti apre una sessione scorekeeper", async () => {
    expect(await login(SCORE_PIN)).toBe("scorekeeper");
    expect(await auth.currentRole()).toBe("scorekeeper");
    expect(await auth.requireScorer()).toBe("scorekeeper");
  });

  it("salva solo lo sha256 del token, mai il token del cookie", async () => {
    await login(ADMIN_PIN);
    const token = cookieToken();
    const rows = sessions();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(sha256Hex(token));
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].role).toBe("admin");
    expect(rows[0].expires_at - rows[0].created_at).toBe(30 * DAY_MS);
  });

  it("imposta il cookie httpOnly, con secure solo in produzione", async () => {
    await login(ADMIN_PIN);
    expect(fakeStore.set.mock.calls[0][0]).toBe(COOKIE);
    expect(fakeStore.set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });

    fakeStore.set.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    await login(ADMIN_PIN);
    expect(fakeStore.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it("rimuove il cookie della vecchia autenticazione", async () => {
    fakeStore.data.set("gsp_admin", "vecchio-token");
    await login(ADMIN_PIN);
    expect(fakeStore.data.has("gsp_admin")).toBe(false);
  });

  it("col PIN sbagliato non apre sessioni e attende un secondo", async () => {
    const pending = auth.loginAdmin("sbagliato");
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(fakeStore.set).not.toHaveBeenCalled();
    expect(sessions()).toHaveLength(0);
  });

  it("spurga le sessioni scadute a ogni login riuscito", async () => {
    const stale = auth.createSession("admin", Date.now() - 40 * DAY_MS);
    expect(sessions()).toHaveLength(1);

    await login(ADMIN_PIN);

    const rows = sessions();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(sha256Hex(cookieToken()));
    expect(rows[0].token_hash).not.toBe(sha256Hex(stale));
  });
});

describe("logoutAdmin", () => {
  it("revoca davvero: il token riusato non vale più", async () => {
    await login(ADMIN_PIN);
    const token = cookieToken();

    await auth.logoutAdmin();

    expect(sessions()).toHaveLength(0);
    expect(await auth.currentRole()).toBeNull();

    // Chi si è copiato il cookie prima del logout non rientra.
    fakeStore.data.set(COOKIE, token);
    expect(await auth.currentRole()).toBeNull();
    expect(auth.validateSession(token)).toBeNull();
  });

  it("senza cookie non lancia e non tocca le altre sessioni", async () => {
    const other = auth.createSession("admin");
    await auth.logoutAdmin();
    expect(auth.validateSession(other)).toBe("admin");
  });
});

describe("scadenza delle sessioni", () => {
  it("una sessione scaduta non vale più e viene rimossa", () => {
    const token = auth.createSession("admin", Date.now() - 31 * DAY_MS);
    expect(sessions()).toHaveLength(1);

    expect(auth.validateSession(token)).toBeNull();
    expect(sessions()).toHaveLength(0);
  });

  it("il cookie di una sessione scaduta non autentica", async () => {
    await login(ADMIN_PIN);
    expect(await auth.currentRole()).toBe("admin");

    vi.setSystemTime(Date.now() + 31 * DAY_MS);
    expect(await auth.currentRole()).toBeNull();
    expect(sessions()).toHaveLength(0);
  });

  it("un token inventato non autentica", async () => {
    fakeStore.data.set(COOKIE, "token-inventato");
    expect(await auth.currentRole()).toBeNull();
  });
});

describe("lockout dei tentativi falliti", () => {
  it("dopo 5 fallimenti blocca anche il PIN giusto, e sblocca dopo 15 minuti", async () => {
    for (let i = 0; i < 5; i++) expect(await login("sbagliato")).toBeNull();

    expect(await login(ADMIN_PIN)).toBeNull();
    expect(sessions()).toHaveLength(0);

    // 14 minuti dopo l'ultimo tentativo il blocco regge ancora...
    vi.setSystemTime(Date.now() + 14 * 60 * 1000);
    expect(await login(ADMIN_PIN)).toBeNull();

    // ...e i tentativi bloccati non lo prolungano: 15 minuti dal quinto
    // fallimento e si rientra.
    vi.setSystemTime(Date.now() + 61 * 1000);
    expect(await login(ADMIN_PIN)).toBe("admin");
  });

  it("quattro fallimenti non bastano", async () => {
    for (let i = 0; i < 4; i++) await login("sbagliato");
    expect(await login(ADMIN_PIN)).toBe("admin");
  });

  it("il blocco è per IP: un altro client non ne risente", async () => {
    for (let i = 0; i < 5; i++) await login("sbagliato");
    expect(await login(ADMIN_PIN)).toBeNull();

    fakeHeaders.ip = "10.9.9.9, 172.16.0.1";
    expect(await login(ADMIN_PIN)).toBe("admin");
  });

  it("un login riuscito azzera il contatore", async () => {
    for (let i = 0; i < 4; i++) await login("sbagliato");
    expect(await login(ADMIN_PIN)).toBe("admin");
    for (let i = 0; i < 4; i++) await login("sbagliato");
    expect(await login(ADMIN_PIN)).toBe("admin");
  });
});

describe("requireAdmin / requireScorer", () => {
  it("senza sessione mandano entrambe al login", async () => {
    await auth.requireAdmin();
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");

    redirectMock.mockClear();
    await auth.requireScorer();
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("da admin lasciano passare entrambe", async () => {
    await login(ADMIN_PIN);
    await auth.requireAdmin();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(await auth.requireScorer()).toBe("admin");
  });

  it("il segnapunti passa requireScorer e viene rimandato alle partite da requireAdmin", async () => {
    await login(SCORE_PIN);
    expect(await auth.requireScorer()).toBe("scorekeeper");
    expect(redirectMock).not.toHaveBeenCalled();

    await auth.requireAdmin();
    expect(redirectMock).toHaveBeenCalledWith("/admin/partite");
  });
});
