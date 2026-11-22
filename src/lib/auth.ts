import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect, notFound } from "next/navigation";
import { hasAccess } from "./access";
import { findUserById, verifyCredentials } from "./users";
import type { User } from "./db/schema";

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
  const session = await auth();
  const id = session?.user?.id;
  return id ? findUserById(id) : null;
});

/** Signed in AND has access; otherwise redirects to /login or /locked. */
export async function requireUser(): Promise<User> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (!hasAccess(u, new Date())) redirect("/locked");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.role !== "ADMIN") notFound();
  return u;
}
