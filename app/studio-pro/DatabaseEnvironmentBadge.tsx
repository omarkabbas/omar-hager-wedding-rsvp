"use client";

const normalizeUrl = (value?: string) => (value || "").trim().replace(/\/+$/, "");

const isDevDatabase =
  Boolean(normalizeUrl(process.env.DEV_SUPABASE_URL)) &&
  normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) === normalizeUrl(process.env.DEV_SUPABASE_URL);

export function DatabaseEnvironmentBadge({ className = "" }: { className?: string }) {
  if (!isDevDatabase) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800 ${className}`}
      title="Connected to the dev Supabase database"
    >
      Dev DB
    </span>
  );
}
