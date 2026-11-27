import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";

// The request headers a server action sees; null = outside a request (as in scripts).
let requestHeaders: Headers | null = null;
vi.mock("next/headers", () => ({
  headers: async () => { if (!requestHeaders) throw new Error("outside a request"); return requestHeaders; },
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

import { authorizeCredentials } from "@/lib/credentials";
import { verifyCredentials, userForSession, findUserById } from "@/lib/users";
import { changePassword, adminResetPassword } from "@/lib/admin";
import { registerUser } from "@/lib/actions/register";
import { LIMITS, clientIp } from "@/lib/rateLimit";

const withPassword = async (email: string, password: string, role: "USER" | "ADMIN" = "USER") => {
  const u = await makeUser(email, role);
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(password, 4) }).where(eq(schema.users.id, u.id));
  return u;
};
const ip = (addr: string) => new Headers({ "x-real-ip": addr });
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); f.set("consent", "on"); return f; };

beforeEach(async () => { await resetDb(); requestHeaders = null; });
afterEach(() => vi.restoreAllMocks());

describe("sign-in", () => {
  it("runs bcrypt even for an email nobody has, so timing does not reveal registered addresses", async () => {
    const spy = vi.spyOn(bcrypt, "compare");
    expect(await verifyCredentials("nobody@x.mn", "password1")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][1])).toMatch(/^\$2[aby]\$/); // compared against a real (dummy) hash
  });

  it("puts the account's session_version in the user it returns", async () => {
    const u = await withPassword("a@x.mn", "password1");
    await db.update(schema.users).set({ sessionVersion: 3 }).where(eq(schema.users.id, u.id));
    expect(await authorizeCredentials({ email: "A@x.mn", password: "password1" }, ip("1.1.1.1"))).toMatchObject({ id: u.id, sv: 3 });
    expect(await authorizeCredentials({ email: "a@x.mn", password: "nope" }, ip("1.1.1.1"))).toBeNull();
  });

  it("refuses an email from one IP after too many attempts, even with the right password, before bcrypt runs", async () => {
    await withPassword("a@x.mn", "password1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < LIMITS.loginIpEmail.max; i++) {
      expect(await authorizeCredentials({ email: "a@x.mn", password: "wrong" }, ip("10.0.0.1"))).toBeNull();
    }
    const spy = vi.spyOn(bcrypt, "compare");
    expect(await authorizeCredentials({ email: "A@x.mn", password: "password1" }, ip("10.0.0.1"))).toBe("limited");
    expect(spy).not.toHaveBeenCalled();
  });

  it("failures from other IPs cannot lock the owner out", async () => {
    const u = await withPassword("victim@x.mn", "password1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let n = 0; n < 3; n++) {
      for (let i = 0; i < LIMITS.loginIpEmail.max + 2; i++) await authorizeCredentials({ email: "victim@x.mn", password: "wrong" }, ip(`10.0.${n}.1`));
      expect(await authorizeCredentials({ email: "victim@x.mn", password: "password1" }, ip(`10.0.${n}.1`))).toBe("limited");
    }
    expect(await authorizeCredentials({ email: "victim@x.mn", password: "password1" }, ip("5.5.5.5"))).toMatchObject({ id: u.id });
  });

  it("refuses an IP after too many attempts across many emails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < LIMITS.loginIp.max; i++) await authorizeCredentials({ email: `u${i}@x.mn`, password: "x" }, ip("9.9.9.9"));
    expect(await authorizeCredentials({ email: "fresh@x.mn", password: "x" }, ip("9.9.9.9"))).toBe("limited");
    expect(await authorizeCredentials({ email: "fresh@x.mn", password: "x" }, ip("8.8.8.8"))).toBeNull(); // another IP is fine
  });

  it("a successful sign-in clears the IP+email count", async () => {
    await withPassword("a@x.mn", "password1");
    for (let i = 0; i < LIMITS.loginIpEmail.max - 1; i++) await authorizeCredentials({ email: "a@x.mn", password: "wrong" }, ip("1.1.1.1"));
    expect(await authorizeCredentials({ email: "a@x.mn", password: "password1" }, ip("1.1.1.1"))).not.toBeNull();
    for (let i = 0; i < LIMITS.loginIpEmail.max - 1; i++) await authorizeCredentials({ email: "a@x.mn", password: "wrong" }, ip("1.1.1.1"));
    expect(await authorizeCredentials({ email: "a@x.mn", password: "password1" }, ip("1.1.1.1"))).not.toBeNull();
  });

  it("reads the client IP from the proxy's X-Real-IP, else the last X-Forwarded-For entry", () => {
    expect(clientIp(new Headers({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6" }))).toBe("5.5.5.5");
    expect(clientIp(new Headers({ "x-forwarded-for": "spoofed, 7.7.7.7" }))).toBe("7.7.7.7");
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(null)).toBe("unknown");
  });
});

describe("sessions end when the password changes", () => {
  it("a token from before a change is refused; the current version is accepted", async () => {
    const u = await withPassword("a@x.mn", "password1");
    expect(await userForSession(u.id, 0)).not.toBeNull();
    expect(await userForSession(u.id, undefined)).not.toBeNull(); // tokens minted before this release count as version 0
    expect(await changePassword(u.id, "password1", "password2")).toEqual({});
    expect(await userForSession(u.id, 0)).toBeNull();
    expect(await userForSession(u.id, 1)).not.toBeNull();
    expect(await verifyCredentials("a@x.mn", "password2")).not.toBeNull();
    expect(await userForSession("missing", 0)).toBeNull();
  });

  it("a wrong current password changes nothing", async () => {
    const u = await withPassword("a@x.mn", "password1");
    expect((await changePassword(u.id, "nope", "password2")).error).toBeTruthy();
    expect((await findUserById(u.id))!.sessionVersion).toBe(0);
  });
});

describe("admin-assisted password reset", () => {
  it("sets a temporary password, signs the user out everywhere and returns it once", async () => {
    const admin = await makeUser("admin@x.mn", "ADMIN");
    const u = await withPassword("a@x.mn", "password1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await adminResetPassword(admin.id, u.id);
    expect(r.password).toMatch(/^[A-Za-z2-9]{14}$/);
    expect(r.email).toBe("a@x.mn");
    expect(await verifyCredentials("a@x.mn", r.password!)).not.toBeNull();
    expect(await verifyCredentials("a@x.mn", "password1")).toBeNull();
    expect(await userForSession(u.id, 0)).toBeNull();
  });

  it("is refused for non-admin callers and for admin accounts", async () => {
    const admin = await makeUser("admin@x.mn", "ADMIN");
    const other = await makeUser("admin2@x.mn", "ADMIN");
    const u = await makeUser("a@x.mn");
    await expect(adminResetPassword(u.id, admin.id)).rejects.toThrow();
    expect((await adminResetPassword(admin.id, other.id)).error).toBeTruthy();
    expect((await findUserById(other.id))!.sessionVersion).toBe(0);
  });
});

describe("sign-up limits", () => {
  it("counts attempts per email", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < LIMITS.registerEmail.max; i++) await registerUser(fd({ name: "A", email: "a@x.mn", password: "password1" }));
    expect((await registerUser(fd({ name: "A", email: "a@x.mn", password: "password1" }))).error).toBe("Хэт олон оролдлого хийлээ. Нэг цагийн дараа дахин оролдоно уу.");
  });

  it("counts attempts per IP (from the proxy header)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    requestHeaders = ip("3.3.3.3");
    for (let i = 0; i < LIMITS.registerIp.max; i++) await registerUser(fd({ name: "A", email: `p${i}@x.mn`, password: "password1" }));
    const r = await registerUser(fd({ name: "A", email: "new@x.mn", password: "password1" }));
    expect(r.error).toMatch(/Хэт олон/);
    expect(await db.select().from(schema.users).where(eq(schema.users.email, "new@x.mn"))).toHaveLength(0);
    requestHeaders = ip("4.4.4.4");
    expect(await registerUser(fd({ name: "A", email: "new@x.mn", password: "password1" }))).toEqual({});
  });
});
