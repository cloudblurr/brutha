import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

/**
 * Dedicated sign-in page (Auth.js `pages.signIn` points here).
 *
 * Server component: if the user already has a session, bounce them to the app.
 * Otherwise render the client-side LoginForm. The optional `callbackUrl` query
 * param is forwarded so users return to where they were headed.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;
  if (session?.user) redirect(callbackUrl || "/");

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="orb mb-4 h-12 w-12 rounded-[16px]" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Sign in to BRUTHA</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Your agent, your data — kept separate per account.
          </p>
        </div>
        <LoginForm callbackUrl={callbackUrl} initialError={error} />
      </div>
    </main>
  );
}
