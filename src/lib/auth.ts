import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect, notFound } from "next/navigation";
import { hasAccess } from "./access";
import { findUserById, verifyCredentials } from "./users";
import type { User } from "./db/schema";
import { unstable_rethrow } from "next/navigation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(c) {
        if (typeof c?.email !== "string" || typeof c?.password !== "string") return null;
        const u = await verifyCredentials(c.email, c.password);
        return u ? { id: u.id, email: u.email, name: u.name } : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** The signed-in user read fresh from the database (once per request), or null. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const session = await auth();
    const id = session?.user?.id;
    return id ? await findUserById(id) : null;
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
