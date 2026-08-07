export function FormMessages({
  ok,
  error,
  okMessage,
}: {
  ok: boolean;
  error: string | null;
  okMessage: string;
}) {
  if (ok)
    return (
      <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-800">
        ✅ {okMessage}
      </div>
    );
  if (error)
    return (
      <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
        ⚠️ {error}
      </div>
    );
  return null;
}
