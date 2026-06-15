import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import {
  findUserByEmail,
  verifyPassword,
  upsertOAuthUser,
  createCredentialsUser,
} from "./users";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Strategy: JWT sessions (no DB session table needed). The user's id is carried
 * in the token and exposed on `session.user.id`, which becomes the per-user
 * data *scope* everywhere else in the app.
 *
 * Providers are enabled conditionally based on environment so the app runs with
 * ZERO configuration:
 *   - GitHub  — enabled when AUTH_GITHUB_ID / AUTH_GITHUB_SECRET are set.
 *   - Google  — enabled when AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are set.
 *   - Credentials — always available. In production it authenticates against
 *     the users table (email + scrypt-hashed password). When
 *     AUTH_ALLOW_DEV_LOGIN=1 (default in development), any email/password signs
 *     in, auto-creating the account — handy for local dev with no OAuth setup.
 *
 * AUTH_SECRET must be set in production; in dev a stable fallback is derived so
 * the app boots without configuration.
 */

function devLoginAllowed(): boolean {
  if (process.env.AUTH_ALLOW_DEV_LOGIN === "1") return true;
  if (process.env.AUTH_ALLOW_DEV_LOGIN === "0") return false;
  return process.env.NODE_ENV !== "production";
}

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    })
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

providers.push(
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (raw) => {
      const email = String(raw?.email ?? "").toLowerCase().trim();
      const password = String(raw?.password ?? "");
      if (!email || !password) return null;

      const existing = findUserByEmail(email);
      if (existing && existing.passwordHash) {
        if (!verifyPassword(password, existing.passwordHash)) return null;
        return {
          id: existing.id,
          email: existing.email,
          name: existing.name ?? undefined,
          image: existing.image ?? undefined,
        };
      }

      // Dev fallback: auto-provision an account on first sign-in so the app is
      // usable with no OAuth configuration. Disabled in production unless
      // explicitly opted in via AUTH_ALLOW_DEV_LOGIN=1.
      if (!existing && devLoginAllowed()) {
        const created = createCredentialsUser(email, password);
        return {
          id: created.id,
          email: created.email,
          name: created.name ?? undefined,
        };
      }

      return null;
    },
  })
);

export const authConfig: NextAuthConfig = {
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    // Persist OAuth users into our users table and pin the canonical id onto
    // the JWT so the rest of the app can use it as the data scope.
    async jwt({ token, user, account, profile }) {
      if (user && account && account.provider !== "credentials") {
        const email =
          (user.email as string | undefined) ??
          (profile?.email as string | undefined);
        if (email) {
          const record = upsertOAuthUser({
            email,
            name: user.name ?? (profile?.name as string | undefined) ?? null,
            image: user.image ?? null,
            provider: account.provider,
          });
          token.uid = record.id;
        }
      } else if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
