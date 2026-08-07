import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geremeas SetPoint",
  description: "Torneo estivo di beach volley di Geremeas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="bg-sky-800 text-white shadow-md">
          <div className="mx-auto max-w-5xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <Link href="/" className="text-xl font-bold tracking-tight">
              🏐 Geremeas SetPoint
            </Link>
            <nav className="flex gap-4 text-sm font-medium">
              <Link href="/" className="hover:text-amber-300">
                Torneo
              </Link>
              <Link href="/iscrizione/squadra" className="hover:text-amber-300">
                Iscrivi squadra
              </Link>
              <Link href="/iscrizione/singolo" className="hover:text-amber-300">
                Iscriviti singolo
              </Link>
              <Link href="/admin" className="hover:text-amber-300">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-amber-200 bg-amber-50 py-4 text-center text-xs text-stone-500">
          Geremeas SetPoint — torneo estivo di beach volley
        </footer>
      </body>
    </html>
  );
}
