import { redirect } from "next/navigation";
import { FormMessages } from "@/components/FormMessages";
import { currentRole } from "@/lib/auth";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const role = await currentRole();
  if (role) redirect(role === "admin" ? "/admin" : "/admin/partite");
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="mb-6 text-center text-2xl font-bold">🔐 Area admin</h1>
      <FormMessages ok={false} error={params.error ?? null} okMessage="" />
      <form
        action={loginAction}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">PIN</label>
          <input
            type="password"
            name="pin"
            required
            autoFocus
            className="w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-sky-700 px-5 py-2.5 font-semibold text-white hover:bg-sky-600"
        >
          Entra
        </button>
      </form>
    </div>
  );
}
