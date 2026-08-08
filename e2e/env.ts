// ABOUTME: Costanti condivise del full-flow e2e: porta dedicata e PIN noti,
// ABOUTME: usati dalla config Playwright, dallo script del server e dallo spec.

/** Porta dedicata: lo smoke (scripts/e2e-smoke.sh) occupa la 3907. */
export const E2E_PORT = 3908;

export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export const ADMIN_PIN = "pin-e2e-full";

export const SCOREKEEPER_PIN = "segnapunti-e2e-full";
