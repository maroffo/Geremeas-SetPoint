// ABOUTME: Rende il testo dei contatti con i numeri di telefono cliccabili (chiamata + WhatsApp)
// ABOUTME: Le porzioni non riconosciute come numero restano testo puro, a capo compresi

import { parseContacts, waLink } from "@/lib/contactLinks";

export function ContactLinks({ text }: { text: string }) {
  const segments = parseContacts(text);

  return (
    <>
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.value}</span>
        ) : (
          <span key={i} className="whitespace-nowrap">
            <a
              href={`tel:${s.e164}`}
              className="font-medium text-sky-700 underline decoration-dotted underline-offset-2 hover:text-sky-600"
            >
              {s.value}
            </a>{" "}
            <a
              href={waLink(s.e164)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
            >
              WhatsApp
            </a>
          </span>
        ),
      )}
    </>
  );
}
