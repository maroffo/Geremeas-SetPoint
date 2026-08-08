// ABOUTME: E2E full-flow con browser vero: dall'iscrizione pubblica delle squadre
// ABOUTME: al podio in home, passando da gironi, calendario, punteggi e tabellone.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADMIN_PIN, BASE_URL } from "./env";

const TOURNAMENT_NAME = "Torneo E2E Geremeas";
const MIN_AGE = "16";

/** Quattro squadre 2x2, la prima giocatrice è donna (vincolo del regolamento). */
const TEAMS = [
  { name: "Onda Anomala", contact: "333 1234561", woman: ["Laura", "Piras"], man: ["Marco", "Sanna"] },
  { name: "Maestrale", contact: "333 1234562", woman: ["Giulia", "Melis"], man: ["Andrea", "Cocco"] },
  { name: "Scirocco", contact: "333 1234563", woman: ["Chiara", "Loi"], man: ["Davide", "Serra"] },
  { name: "Libeccio", contact: "333 1234564", woman: ["Sara", "Pinna"], man: ["Luca", "Murgia"] },
];

/** La squadra A vince sempre 2-0: il vincitore è prevedibile a ogni turno. */
const WINNING_SETS = [
  { a: "21", b: "15" },
  { a: "21", b: "18" },
];

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Le partite con entrambe le squadre note hanno il form dei set: una per partita. */
function scoreForms(page: Page): Locator {
  return page.locator('form:has(input[name="set1a"])');
}

/** Ogni partita giocata mostra "annulla risultato": è il contatore dei risultati. */
function playedMatches(page: Page): Locator {
  return page.getByRole("button", { name: "annulla risultato" });
}

async function playMatch(page: Page, index: number, playedBefore: number) {
  const form = scoreForms(page).nth(index);
  for (const [i, set] of WINNING_SETS.entries()) {
    await form.locator(`input[name="set${i + 1}a"]`).fill(set.a);
    await form.locator(`input[name="set${i + 1}b"]`).fill(set.b);
  }
  await form.getByRole("button", { name: /Risultato/ }).click();
  await expect(playedMatches(page)).toHaveCount(playedBefore + 1);
}

test("dall'iscrizione delle squadre al podio in home", async ({
  page,
  browser,
}) => {
  // Il visitatore del sito non ha (e non deve avere) la sessione admin.
  const publicContext = await browser.newContext({ baseURL: BASE_URL });
  const publicPage = await publicContext.newPage();

  await test.step("la home parte senza torneo", async () => {
    await publicPage.goto("/");
    await expect(
      publicPage.getByRole("heading", { name: "Il torneo non è ancora iniziato" }),
    ).toBeVisible();
  });

  await test.step("l'organizzatore entra con il PIN", async () => {
    await page.goto("/admin/login");
    await page.locator('input[name="pin"]').fill(ADMIN_PIN);
    await page.getByRole("button", { name: "Entra" }).click();
    await expect(page.getByRole("heading", { name: "Gestione torneo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Iscrizioni" })).toBeVisible();
  });

  await test.step("crea il torneo con requisito d'età", async () => {
    await page.locator('input[name="name"]').fill(TOURNAMENT_NAME);
    await page.locator('select[name="teamSize"]').selectOption("2");
    await page.locator('input[name="minAge"]').fill(MIN_AGE);
    await page.locator('textarea[name="contactInfo"]').fill("Info al 333 1234560");
    await page.getByRole("button", { name: "Crea torneo" }).click();

    // exact: il testo compare anche nel promemoria "Con le iscrizioni aperte…".
    await expect(page.getByText("Iscrizioni aperte", { exact: true })).toBeVisible();
    await expect(page.getByText(TOURNAMENT_NAME)).toBeVisible();
  });

  await test.step("configura due giornate e due campi", async () => {
    const dayForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "+ Giornata" }) });
    // Ogni conferma ricarica la pagina: si aspetta la riga aggiunta prima di
    // compilare la successiva, altrimenti il fill finisce sul form uscente.
    for (const [i, offset] of [1, 2].entries()) {
      await dayForm.locator('input[name="date"]').fill(isoDate(offset));
      await dayForm.getByRole("button", { name: "+ Giornata" }).click();
      await expect(page.getByText("18:00–20:30")).toHaveCount(i + 1);
    }

    const courtForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "+ Campo" }) });
    for (const court of ["Campo 1", "Campo 2"]) {
      await courtForm.locator('input[name="name"]').fill(court);
      await courtForm.getByRole("button", { name: "+ Campo" }).click();
      await expect(page.getByText(court)).toBeVisible();
    }
  });

  await test.step("quattro squadre si iscrivono dal sito", async () => {
    for (const team of TEAMS) {
      await publicPage.goto("/iscrizione/squadra");
      await expect(
        publicPage.getByRole("heading", { name: "Iscrivi la tua squadra" }),
      ).toBeVisible();
      await expect(
        publicPage.getByText(`Torneo riservato a chi ha almeno ${MIN_AGE} anni`),
      ).toBeVisible();

      await publicPage.locator('input[name="teamName"]').fill(team.name);
      await publicPage.locator('input[name="contact"]').fill(team.contact);
      await publicPage.locator('input[name="p0_first"]').fill(team.woman[0]);
      await publicPage.locator('input[name="p0_last"]').fill(team.woman[1]);
      await publicPage.locator('input[name="p1_first"]').fill(team.man[0]);
      await publicPage.locator('input[name="p1_last"]').fill(team.man[1]);
      await publicPage.locator('input[name="ageConfirmed"]').check();
      await publicPage.getByRole("button", { name: "Iscrivi la squadra" }).click();

      await expect(publicPage.getByText("Squadra iscritta!")).toBeVisible();
    }
  });

  await test.step("la home elenca le squadre in attesa", async () => {
    await publicPage.goto("/");
    await expect(publicPage.getByText("(in attesa di conferma)")).toHaveCount(
      TEAMS.length,
    );
    for (const team of TEAMS) {
      await expect(publicPage.getByText(team.name)).toBeVisible();
    }
  });

  await test.step("l'organizzatore conferma le quattro iscrizioni", async () => {
    await page.goto("/admin/iscrizioni");
    await expect(
      page.getByRole("heading", { name: `Squadre (${TEAMS.length})` }),
    ).toBeVisible();
    await expect(page.getByText("in attesa")).toHaveCount(TEAMS.length);

    for (let left = TEAMS.length; left > 0; left--) {
      const confirm = page.getByRole("button", { name: "✅ Conferma" });
      await confirm.first().click();
      await expect(confirm).toHaveCount(left - 1);
    }
    await expect(page.getByText("confermata")).toHaveCount(TEAMS.length);
  });

  await test.step("genera due gironi", async () => {
    await page.goto("/admin/gironi");
    await expect(page.getByText(`${TEAMS.length} squadre attive`)).toBeVisible();
    await page.locator('select[name="numGroups"]').selectOption("2");
    await page.getByRole("button", { name: "Genera gironi" }).click();

    await expect(page.getByRole("heading", { name: "Girone A" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Girone B" })).toBeVisible();
  });

  await test.step("genera il calendario dei gironi", async () => {
    await page.goto("/admin/partite");
    await expect(scoreForms(page)).toHaveCount(2);
    await page.getByRole("button", { name: /Genera calendario/ }).click();
    // Ogni partita di girone mostra ora giorno, ora e campo assegnati.
    await expect(page.getByText(/Campo \d/)).toHaveCount(2);
  });

  await test.step("si giocano le partite dei gironi", async () => {
    for (let i = 0; i < 2; i++) await playMatch(page, i, i);
    await expect(playedMatches(page)).toHaveCount(2);
    await expect(page.getByText("2-0")).toHaveCount(2);
  });

  await test.step("genera il tabellone", async () => {
    await page.goto("/admin/tabellone");
    await expect(
      page.getByText("Avanzano le prime 2 di ogni girone"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Genera tabellone" }).click();

    await expect(page.getByRole("heading", { name: "Tabellone" })).toBeVisible();
    await expect(page.getByText("Semifinali")).toBeVisible();
    await expect(page.getByText("Finale 3º posto")).toBeVisible();
  });

  await test.step("completa il calendario con le partite del tabellone", async () => {
    await page.goto("/admin/partite");
    await expect(
      page.getByRole("heading", { name: "Semifinali — eliminazione diretta" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Completa calendario/ }).click();
    // Alle 2 partite di girone si aggiungono le 4 del tabellone, in coda.
    await expect(page.getByText(/Campo \d/)).toHaveCount(6);
  });

  await test.step("si giocano semifinali, finale e finalina", async () => {
    // Gironi giocati (2) + le due semifinali; finale e finalina sono ancora vuote.
    await expect(scoreForms(page)).toHaveCount(4);

    for (let i = 2; i < 4; i++) await playMatch(page, i, i);

    // Le vincenti sono state propagate: finale e finalina hanno le squadre.
    await expect(
      page.getByRole("heading", { name: "Finale — eliminazione diretta" }),
    ).toBeVisible();
    await expect(page.getByText("Finale 3º/4º posto")).toBeVisible();
    await expect(scoreForms(page)).toHaveCount(6);

    for (let i = 4; i < 6; i++) await playMatch(page, i, i);

    await expect(playedMatches(page)).toHaveCount(6);
    await expect(page.getByRole("button", { name: /^forfait / })).toHaveCount(0);
  });

  let champion = "";

  await test.step("l'organizzatore chiude il torneo", async () => {
    await page.goto("/admin/tabellone");
    const winnerCard = page.getByText("🏆 Vincitore:");
    await expect(winnerCard).toBeVisible();
    champion = (await winnerCard.locator("strong").innerText()).trim();
    expect(TEAMS.map((t) => t.name)).toContain(champion);

    await page.getByRole("button", { name: "🏁 Chiudi il torneo" }).click();
    await expect(page.getByText("Concluso")).toBeVisible();
  });

  await test.step("la home mostra il podio", async () => {
    await publicPage.goto("/");
    await expect(publicPage.getByRole("heading", { name: champion })).toBeVisible();
    await expect(
      publicPage.getByText(`vince il ${TOURNAMENT_NAME}`),
    ).toBeVisible();
    // Argento e bronzo: la finalina è stata giocata, il podio è completo.
    await expect(publicPage.getByText("🥈")).toBeVisible();
    await expect(publicPage.getByText("🥉")).toBeVisible();
  });

  await publicContext.close();
});
