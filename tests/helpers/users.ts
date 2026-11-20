import { db, schema } from "@/lib/db";

export async function makeUser(email: string, role: "USER" | "ADMIN" = "USER") {
  const [u] = await db.insert(schema.users).values({ email, name: email.split("@")[0], passwordHash: "x", role }).returning();
  return u;
}
