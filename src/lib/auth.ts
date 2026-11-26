import { cache } from "react";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect, notFound } from "next/navigation";
import { hasAccess } from "./access";
import { userForSession } from "./users";
import { authorizeCredentials } from "./credentials";
import type { User } from "./db/schema";
import { unstable_rethrow } from "next/navigation";

declare module "next-auth" {
  interface Session { sv?: number }
}

/** Thrown from authorize when an IP or an email has had too many attempts; loginAction tells the visitor to wait. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(c, request) {
        const r = await authorizeCredentials(c, request?.headers ?? null);
        if (r === "limited") throw new TooManyAttempts();
        return r;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        // the account's session_version at sign-in; a password change or reset bumps it and this token stops working
        token.sv = (user as { sv?: number }).sv ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.sv = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
});

/** The signed-in user read fresh from the database (once per request), or null. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const session = await auth();
    const id = session?.user?.id;
    // a token minted before the last password change or reset is refused
    return id ? await userForSession(id, session?.sv) : null;
  } catch (e) {
    unstable_rethrow(e); // Next.js signals (dynamic rendering, redirects) are not failures and must pass through
    // Shown to the visitor as signed out, but a database or session failure must still be visible in the logs.
    console.error("[auth] could not read the session user", e instanceof Error ? e.message : e);
    return null;
  }
});

/** Signed in; otherwise redirects to /login. Without a plan the pages still open, with the paid numbers hidden. */
export async function requireUser(): Promise<User> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

/** Signed in AND on a plan (admins always); otherwise to /login or the plans page. For actions only members may take. */
export async function requirePaid(): Promise<User> {
  const u = await requireUser();
  if (!hasAccess(u, new Date())) redirect("/plans");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.role !== "ADMIN") notFound();
  return u;
}
