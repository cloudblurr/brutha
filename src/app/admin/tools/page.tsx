import { notFound } from "next/navigation";
import { getToolManifest } from "@/lib/tool-registry";
import { isAdminContext } from "@/lib/admin-auth";

export const runtime = "nodejs";

export const metadata = {
  title: "BRUTHA · Tools",
  robots: { index: false, follow: false },
};

/**
 * Hidden admin page (S8) that lists every registered tool grouped by category.
 * Server component — reads the manifest directly. Not linked from the main UI
 * and marked noindex. Gated by ADMIN_SECRET (lib/admin-auth): when the secret
 * is configured, callers must pass ?admin_key=<secret> (or the x-admin-secret
 * header); otherwise the page 404s. Open when ADMIN_SECRET is unset.
 */
export default async function ToolsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ admin_key?: string }>;
}) {
  const { admin_key } = await searchParams;
  if (!(await isAdminContext(admin_key))) {
    notFound();
  }

  const manifest = getToolManifest();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Tool registry</h1>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        {manifest.total} tools registered across{" "}
        {Object.keys(manifest.categories).length} categories.
      </p>

      <div className="mt-8 space-y-8">
        {Object.entries(manifest.categories).map(([category, names]) => (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <h2
              id={`cat-${category}`}
              className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]"
            >
              {category} ({names.length})
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {names.map((name) => (
                <li
                  key={name}
                  className="rounded-lg border px-2.5 py-1 font-mono text-xs"
                >
                  {name}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {manifest.plugins.length > 0 && (
          <section aria-labelledby="cat-plugins">
            <h2
              id="cat-plugins"
              className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]"
            >
              plugins ({manifest.plugins.length})
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {manifest.plugins.map((name) => (
                <li
                  key={name}
                  className="rounded-lg border px-2.5 py-1 font-mono text-xs"
                >
                  {name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className="mt-10 text-xs text-[var(--fg-subtle)]">
        JSON manifest available at{" "}
        <a className="underline" href="/api/tools">
          /api/tools
        </a>
        .
      </p>
    </main>
  );
}
