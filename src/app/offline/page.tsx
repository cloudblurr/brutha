import Link from "next/link";

export const metadata = { title: "Offline — BRUTHA" };

/**
 * Offline fallback shown by the service worker when a navigation fails and no
 * cached copy exists. Intentionally static and self-contained (no client data).
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-5xl">📡</div>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-neutral-400">
        BRUTHA can&apos;t reach the network right now. Your installed app shell
        loaded from cache — reconnect to start a new chat.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Try again
      </Link>
    </main>
  );
}
