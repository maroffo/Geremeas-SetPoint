// ABOUTME: Test dell'autenticazione admin: verifyPin fail-closed in produzione,
// ABOUTME: cookie di sessione (loginAdmin/isAdmin/requireAdmin) con store mockato

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAdmin, loginAdmin, requireAdmin, verifyPin } from "../auth";

const { fakeStore, redirectMock } = vi.hoisted(() => {
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
    delete(name: string) {
      data.delete(name);
    },
  };
  return { fakeStore, redirectMock: vi.fn() };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => fakeStore) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

beforeEach(() => {
  fakeStore.data.clear();
  fakeStore.set.mockClear();
  redirectMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("verifyPin", () => {
  it("accetta il PIN configurato e rifiuta gli altri", () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    expect(verifyPin("segretissimo")).toBe(true);
    expect(verifyPin("sbagliato")).toBe(false);
    expect(verifyPin("")).toBe(false);
  });

  it("accetta il PIN configurato anche in produzione", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    expect(verifyPin("segretissimo")).toBe(true);
  });

  it("in produzione senza ADMIN_PIN nega l'accesso (fail closed)", () => {
    vi.stubEnv("ADMIN_PIN", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => verifyPin("geremeas")).toThrow(/ADMIN_PIN/);
  });

  it("fuori produzione senza ADMIN_PIN usa il default di sviluppo", () => {
    vi.stubEnv("ADMIN_PIN", undefined);
    expect(verifyPin("geremeas")).toBe(true);
  });
});

describe("loginAdmin", () => {
  it("con il PIN giusto imposta il cookie e isAdmin diventa true", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    expect(await loginAdmin("segretissimo")).toBe(true);
    expect(await isAdmin()).toBe(true);
  });

  it("imposta secure solo in produzione", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    await loginAdmin("segretissimo");
    expect(fakeStore.set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      secure: false,
    });

    fakeStore.set.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    await loginAdmin("segretissimo");
    expect(fakeStore.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it("con il PIN sbagliato non imposta il cookie e attende 1s", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    vi.useFakeTimers();
    const pending = loginAdmin("sbagliato");
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(false);
    expect(fakeStore.set).not.toHaveBeenCalled();
  });
});

describe("isAdmin", () => {
  it("senza cookie è false", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    expect(await isAdmin()).toBe(false);
  });

  it("con un cookie di lunghezza diversa è false e non lancia", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    fakeStore.data.set("gsp_admin", "x");
    await expect(isAdmin()).resolves.toBe(false);
  });

  it("con un token sbagliato della stessa lunghezza è false", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    fakeStore.data.set("gsp_admin", "0".repeat(64));
    expect(await isAdmin()).toBe(false);
  });

  it("in produzione senza ADMIN_PIN è false anche con un cookie valido", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    await loginAdmin("segretissimo");
    vi.stubEnv("ADMIN_PIN", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(await isAdmin()).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("ridirige al login quando non si è admin", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    await requireAdmin();
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("non ridirige quando si è admin", async () => {
    vi.stubEnv("ADMIN_PIN", "segretissimo");
    await loginAdmin("segretissimo");
    await requireAdmin();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
