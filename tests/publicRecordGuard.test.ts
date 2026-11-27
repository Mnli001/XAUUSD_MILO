import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEFAULT_LIVE_CONFIG } from "@/lib/bot/live";
import { PUBLIC_RECORD_KEY, forgetPublicRecord, readPublicRecordSetting, setPublicRecord } from "@/lib/publicRecord";
import type { User } from "@/lib/db/schema";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

// requireAdmin as the real one behaves: no session → /login, not an admin → 404, both thrown.
let session: User | null = null;
const requireAdmin = vi.fn(async () => {
  if (!session) throw new Error("NEXT_REDIRECT /login");
  if (session.role !== "ADMIN") throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  return session;
});
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin(), requireUser: async () => session, getSessionUser: async () => session, signIn: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import AdminRecordPage from "@/app/admin/record/page";
import { setPublicRecordAction, clearPublicRecordAction } from "@/lib/actions/admin";
import { GET } from "@/app/api/public-record/route";

const LOGIN = "51234567";
let admin: User, member: User;
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeEach(async () => {
  await resetDb();
  await db.delete(schema.appState).where(eq(schema.appState.key, PUBLIC_RECORD_KEY));
  forgetPublicRecord();
  requireAdmin.mockClear();
  admin = await makeUser("owner@x.mn", "ADMIN");
  member = await makeUser("member@x.mn");
  await db.insert(schema.botLive).values({ userId: admin.id, login: LOGIN, server: "Broker-Demo", config: DEFAULT_LIVE_CONFIG, status: { account: { login: "••••4567", mode: "DEMO", balance: 1000, equity: 1000 } } });
  session = null;
});

test("the admin page is guarded by requireAdmin", async () => {
  await expect(AdminRecordPage()).rejects.toThrow(/login/);
  session = member;
  await expect(AdminRecordPage()).rejects.toThrow(/404/);
  expect(requireAdmin).toHaveBeenCalledTimes(2);
});

test("a member cannot choose or clear the public record through the actions", async () => {
  session = member;
  await expect(setPublicRecordAction({}, form({ login: LOGIN, since: "" }))).rejects.toThrow();
  expect(await readPublicRecordSetting()).toBeNull();
  session = admin;
  expect(await setPublicRecordAction({}, form({ login: LOGIN, since: "" }))).toEqual({ ok: expect.any(String) });
  session = member;
  await expect(clearPublicRecordAction()).rejects.toThrow();
  expect(await readPublicRecordSetting()).not.toBeNull();
  session = admin;
  await clearPublicRecordAction();
  expect(await readPublicRecordSetting()).toBeNull();
});

test("GET /api/public-record needs no sign-in and carries nothing that identifies the account", async () => {
  let body = await (await GET()).json();
  expect(body).toEqual({ record: null });
  await setPublicRecord(admin.id, LOGIN, "", new Date());
  const res = await GET();
  expect(res.status).toBe(200);
  const text = await res.text();
  body = JSON.parse(text);
  expect(body.record).toMatchObject({ mode: "DEMO", trades: 0, startBalance: 1000 });
  for (const secret of [LOGIN, "4567", admin.id, admin.email, "Broker-Demo", "userId", "login", "token"]) expect(text).not.toContain(secret);
});
