"use client";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto mt-16 rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Something went wrong on this page</h1>
      <p className="text-sm text-slate-600 mb-1">Your vault and notes were not changed.</p>
      <p className="text-xs font-mono text-slate-500 break-words mb-6">{error.message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          Try again
        </button>
        <Link href="/vaults" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Go to Vaults
        </Link>
      </div>
    </div>
  );
}
