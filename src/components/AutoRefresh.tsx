// ABOUTME: Ricarica periodica dei dati della pagina (router.refresh) per le viste pubbliche live
// ABOUTME: Salta il refresh se la scheda non è in primo piano o se il precedente è ancora in corso

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

const DEFAULT_INTERVAL_MS = 60_000;

export function AutoRefresh({
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Il tick legge lo stato dentro una closure: serve un ref, non lo state,
  // altrimenti l'intervallo andrebbe ricreato a ogni refresh. Lo aggiorna solo
  // React, così un refresh che finisce all'istante non lascia il flag alzato.
  const pending = useRef(false);

  useEffect(() => {
    pending.current = isPending;
  }, [isPending]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (pending.current) return;
      startTransition(() => router.refresh());
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, startTransition]);

  return null;
}
