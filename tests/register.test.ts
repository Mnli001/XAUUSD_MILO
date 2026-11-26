import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { registerUser } from "@/lib/actions/register";
import { verifyCredentials } from "@/lib/users";
import { resetDb } from "./helpers/db";

const fd = (o: Record<string, string>, consent = true) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); if (consent) f.set("consent", "on"); return f; };

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

test("a new account starts with the visitor's language, theme and time zone, and is answered in that language", async () => {
  const { enT } = await import("@/lib/i18n");
  const prefs = { locale: "en" as const, theme: "light" as const, timeZone: "Europe/London" };
  expect(await registerUser(fd({ name: "Z", email: "z@x.mn", password: "password1" }), enT, prefs)).toEqual({});
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, "z@x.mn"));
  expect(u).toMatchObject({ locale: "en", theme: "light", timeZone: "Europe/London" });
  expect((await registerUser(fd({ name: "Z", email: "z@x.mn", password: "password1" }), enT, prefs)).error).toBe("This email is already registered");
});

test("registering needs the privacy policy and terms accepted, and records when and which version", async () => {
  const { LEGAL_VERSION } = await import("@/lib/legal");
  const r = await registerUser(fd({ name: "N", email: "noconsent@x.mn", password: "password1" }, false));
  expect(r.error).toMatch(/Нууцлалын бодлого/);
  expect(await db.select().from(schema.users).where(eq(schema.users.email, "noconsent@x.mn"))).toHaveLength(0);
  const before = Date.now();
  expect(await registerUser(fd({ name: "Y", email: "yes@x.mn", password: "password1" }))).toEqual({});
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, "yes@x.mn"));
  expect(u.consentVersion).toBe(LEGAL_VERSION);
  expect(u.consentAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
});
