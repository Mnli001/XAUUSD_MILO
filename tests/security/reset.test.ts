import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";

const redirectTo = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirectTo(u) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "2.2.2.2" }), cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => null }));

import { createResetToken, resetTokenValid, resetPasswordWithToken, RESET_TTL_MS } from "@/lib/passwordReset";
import { resetPasswordAction } from "@/lib/actions/passwordReset";
import { verifyCredentials, userForSession, findUserById } from "@/lib/users";

const now = new Date("2026-11-27T10:00:00Z");
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeEach(async () => { await resetDb(); redirectTo.mockClear(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("Telegram password reset links", () => {
  it("store only a hash, work once, and end every session", async () => {
    const u = await makeUser("a@x.mn");
    const token = await createResetToken(u.id, now);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const [row] = await db.select().from(schema.passwordResets);
    expect(row.tokenHash).not.toBe(token);
    expect(await resetTokenValid(token, now)).toBe(true);

    expect(await resetPasswordWithToken(token, "short", now)).toEqual({ error: "password" });
    expect(await resetPasswordWithToken(token, "new-password-1", now)).toEqual({ userId: u.id });
    expect(await verifyCredentials("a@x.mn", "new-password-1")).not.toBeNull();
    expect(await userForSession(u.id, 0)).toBeNull(); // signed out everywhere
    expect((await findUserById(u.id))!.sessionVersion).toBe(1);

    expect(await resetPasswordWithToken(token, "another-password", now)).toEqual({ error: "invalid" }); // once only
    expect(await resetTokenValid(token, now)).toBe(false);
  });

  it("expire after 30 minutes, and reject anything that is not a token", async () => {
    const u = await makeUser("a@x.mn");
    const token = await createResetToken(u.id, now);
    const late = new Date(now.getTime() + RESET_TTL_MS + 1);
    expect(await resetTokenValid(token, late)).toBe(false);
    expect(await resetPasswordWithToken(token, "new-password-1", late)).toEqual({ error: "invalid" });
    expect(await resetPasswordWithToken("' OR 1=1 --", "new-password-1", now)).toEqual({ error: "invalid" });
    expect(await resetTokenValid("x".repeat(64), now)).toBe(false);
  });

  it("the form checks the two passwords match, then sends the visitor to sign in", async () => {
    const u = await makeUser("a@x.mn");
    await db.update(schema.users).set({ passwordHash: await bcrypt.hash("old-password", 4) }).where(eq(schema.users.id, u.id));
    const token = await createResetToken(u.id);
    expect((await resetPasswordAction({}, form({ token, password: "new-password-1", confirm: "different-1" }))).error).toBe("Хоёр нууц үг таарахгүй байна");
    expect((await resetPasswordAction({}, form({ token: "0".repeat(64), password: "new-password-1", confirm: "new-password-1" }))).error).toMatch(/Холбоос хүчингүй/);
    await expect(resetPasswordAction({}, form({ token, password: "new-password-1", confirm: "new-password-1" }))).rejects.toThrow("REDIRECT:/login?reset=1");
    expect(await verifyCredentials("a@x.mn", "new-password-1")).not.toBeNull();
  });
});
