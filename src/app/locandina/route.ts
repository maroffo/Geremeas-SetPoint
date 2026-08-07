// ABOUTME: Serve la locandina del torneo attivo (BLOB in SQLite) come immagine
// ABOUTME: 404 se il torneo non esiste o non ha una locandina caricata

import { getActiveTournament, getPoster } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const tournament = getActiveTournament();
  const poster = tournament ? getPoster(tournament.id) : undefined;
  if (!poster) return new Response("Nessuna locandina", { status: 404 });
  return new Response(new Uint8Array(poster.data), {
    headers: {
      "Content-Type": poster.mime,
      "X-Content-Type-Options": "nosniff",
      // La locandina cambia di rado: cache breve, senza invalidazione manuale
      "Cache-Control": "public, max-age=300",
    },
  });
}
