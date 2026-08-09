// ABOUTME: Test del parser dei contatti: riconoscimento dei numeri nel testo libero e forma E.164
// ABOUTME: Nessuna dipendenza da DB o Next, la funzione è pura

import { describe, expect, it } from "vitest";
import { parseContacts, toE164, waLink } from "../contactLinks";

function phones(text: string) {
  return parseContacts(text).filter((s) => s.kind === "phone");
}

function rendered(text: string): string {
  return parseContacts(text)
    .map((s) => s.value)
    .join("");
}

describe("parseContacts", () => {
  it("riconosce due numeri in un testo misto e lascia intatto il resto", () => {
    const text =
      "Per info: Marco 333 1234567\noppure Giulia 340-9876543 (dopo le 18)";
    const found = phones(text);

    expect(found.map((p) => p.e164)).toEqual(["+393331234567", "+393409876543"]);
    expect(found.map((p) => waLink(p.e164))).toEqual([
      "https://wa.me/393331234567",
      "https://wa.me/393409876543",
    ]);
    // Ricomponendo i segmenti si riottiene il testo originale, carattere per carattere
    expect(rendered(text)).toBe(text);
  });

  it("non raddoppia il prefisso quando è già presente", () => {
    expect(phones("Chiama +39 333 1234567").map((p) => p.e164)).toEqual([
      "+393331234567",
    ]);
    expect(phones("Dall'estero 0039 333 1234567").map((p) => p.e164)).toEqual([
      "+393331234567",
    ]);
    expect(phones("Svizzera +41 79 1234567").map((p) => p.e164)).toEqual([
      "+41791234567",
    ]);
  });

  it("lascia testo puro quando non ci sono numeri di telefono", () => {
    const text = "Ci trovate al chiosco, oppure scrivete a info@geremeas.it";
    expect(phones(text)).toHaveLength(0);
    expect(parseContacts(text)).toEqual([{ kind: "text", value: text }]);
  });

  it("non scambia date, orari e anni per numeri di telefono", () => {
    expect(phones("Torneo il 10.08.2026, ritrovo alle 18.30")).toHaveLength(0);
    expect(phones("Edizione 2026")).toHaveLength(0);
    expect(rendered("Torneo il 10.08.2026")).toBe("Torneo il 10.08.2026");
  });

  it("lascia testo le sequenze che validatePhone rifiuta", () => {
    // 16 cifre: oltre il massimo E.164
    const text = "Codice 1234567890123456";
    expect(phones(text)).toHaveLength(0);
    expect(rendered(text)).toBe(text);
  });

  it("gestisce testo vuoto", () => {
    expect(parseContacts("")).toEqual([]);
  });
});

describe("toE164", () => {
  it("normalizza i formati accettati da validatePhone", () => {
    expect(toE164("333 123 4567")).toBe("+393331234567");
    expect(toE164("(070) 123456 78")).toBe("+3907012345678");
    expect(toE164("+39 333 1234567")).toBe("+393331234567");
  });

  it("rifiuta ciò che non è un numero", () => {
    expect(toE164("chiedete di Mario")).toBeNull();
    expect(toE164("12345")).toBeNull();
  });
});
