import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { registerUser } from "@/lib/actions/register";
import { verifyCredentials } from "@/lib/users";
import { resetDb } from "./helpers/db";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeAll(resetDb);

test("register hashes the password, normalises email, rejects duplicates and short passwords", async () => {
  expect(await registerUser(fd({ name: "A", email: " A@x.mn ", password: "password1" }))).toEqual({});
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, "a@x.mn"));
  expect(u.passwordHash).not.toContain("password1");
  expect(u.accessUntil).toBeNull();
  expect(u.role).toBe("USER");
  expect((await registerUser(fd({ name: "B", email: "a@x.mn", password: "password1" }))).error).toBe("Энэ имэйл бүртгэлтэй байна");
  expect((await registerUser(fd({ name: "C", email: "c@x.mn", password: "short" }))).error).toBeTruthy();
  expect((await registerUser(fd({ name: "", email: "d@x.mn", password: "password1" }))).error).toBeTruthy();
  expect((await registerUser(fd({ name: "E", email: "not-an-email", password: "password1" }))).error).toBeTruthy();
});
test("verifyCredentials accepts the right password only", async () => {
  expect((await verifyCredentials("A@x.mn", "password1"))?.email).toBe("a@x.mn");
  expect(await verifyCredentials("a@x.mn", "wrong-password")).toBeNull();
  expect(await verifyCredentials("nobody@x.mn", "password1")).toBeNull();
});
