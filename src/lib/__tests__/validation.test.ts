// ABOUTME: Test delle validazioni pure: telefono permissivo e frase del requisito d'età
// ABOUTME: Nessuna dipendenza da DB o Next

import { describe, expect, it } from "vitest";
import { agePhrase, hasAgeRequirement, validatePhone } from "../validation";

describe("validatePhone", () => {
  it("accetta formati comuni italiani e internazionali", () => {
    expect(validatePhone("3331234567")).toBe("3331234567");
    expect(validatePhone("333 123 4567")).toBe("333 123 4567");
    expect(validatePhone("+39 333 1234567")).toBe("+39 333 1234567");
    expect(validatePhone("  333-123.4567 ")).toBe("333-123.4567");
    expect(validatePhone("(070) 123456 78")).toBe("(070) 123456 78");
  });

  it("rifiuta email, testo libero e numeri troppo corti o lunghi", () => {
    expect(validatePhone("mario@example.com")).toBeNull();
    expect(validatePhone("chiedete di Mario")).toBeNull();
    expect(validatePhone("12345")).toBeNull();
    expect(validatePhone("1234567890123456")).toBeNull();
    expect(validatePhone("")).toBeNull();
    expect(validatePhone("   ")).toBeNull();
    expect(validatePhone("333 1234567 int. 2")).toBeNull();
  });

  it("rifiuta input oltre i 32 caratteri anche se le cifre sono valide", () => {
    expect(validatePhone(`${"(".repeat(30)}3331234567`)).toBeNull();
    expect(validatePhone("+39 333 1234567".padEnd(33, " "))).toBe(
      "+39 333 1234567",
    );
  });
});

describe("agePhrase / hasAgeRequirement", () => {
  it("descrive minima, massima e intervallo", () => {
    expect(agePhrase({ minAge: 35, maxAge: null })).toBe("almeno 35 anni");
    expect(agePhrase({ minAge: null, maxAge: 17 })).toBe("al massimo 17 anni");
    expect(agePhrase({ minAge: 16, maxAge: 18 })).toBe("tra 16 e 18 anni");
  });

  it("senza vincoli non produce frase né requisito", () => {
    expect(agePhrase({ minAge: null, maxAge: null })).toBeNull();
    expect(hasAgeRequirement({ minAge: null, maxAge: null })).toBe(false);
    expect(hasAgeRequirement({ minAge: 35, maxAge: null })).toBe(true);
  });
});
