import { type DefaultSession } from "next-auth";

/**
 * Augment Auth.js types so `session.user.id` and `token.uid` are typed.
 * `session.user.id` is the per-user data scope used throughout the app.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
  }
}
