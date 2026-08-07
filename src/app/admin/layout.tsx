import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { logoutAction } from "./actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAdmin();

  return (
    <div>
      {authed && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm shadow-sm">
          <span className="font-semibold text-stone-500">Admin:</span>
          <Link href="/admin" className="text-sky-700 hover:underline">
            Torneo
          </Link>
          <Link href="/admin/iscrizioni" className="text-sky-700 hover:underline">
            Iscrizioni
          </Link>
          <Link href="/admin/squadre" className="text-sky-700 hover:underline">
            Squadre
          </Link>
          <Link href="/admin/gironi" className="text-sky-700 hover:underline">
            Gironi
          </Link>
          <Link href="/admin/partite" className="text-sky-700 hover:underline">
            Partite
          </Link>
          <Link href="/admin/tabellone" className="text-sky-700 hover:underline">
            Tabellone
          </Link>
          <form action={logoutAction} className="ml-auto">
            <button className="text-stone-400 hover:text-stone-600">
              Esci
            </button>
          </form>
        </div>
      )}
      {children}
    </div>
  );
}
