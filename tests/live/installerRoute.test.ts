import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { db } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { rotateToken, userForToken } from "@/lib/bot/liveDb";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";

let session: User | null = null;
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session }));
import { GET as installer } from "@/app/api/bot/installer/route";
import { GET as download } from "@/app/api/bot/download/route";

const ORIGIN = "https://xau.example.mn";
const req = (path: string, headers: Record<string, string> = {}) => new Request(`https://ignored.example${path}`, { headers });
const ownerOf = async (token: string) => (await userForToken(token))?.id ?? null;
const giveAccess = (u: User) => db.execute(sql`UPDATE users SET access_until = ${new Date(Date.now() + 30 * 864e5)} WHERE id = ${u.id}`);
const reload = async (u: User) => ({ ...u, accessUntil: new Date(Date.now() + 30 * 864e5) });

let savedAppUrl: string | undefined;
beforeEach(async () => {
  await resetDb();
  session = null;
  savedAppUrl = process.env.APP_URL;
  process.env.APP_URL = `${ORIGIN}/`;
});
afterEach(() => { if (savedAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = savedAppUrl; });

describe("GET /api/bot/installer", () => {
  it("needs a signed-in member with a plan", async () => {
    expect((await installer(req("/api/bot/installer"))).status).toBe(401);
    session = await makeUser("free@x.mn");
    expect((await installer(req("/api/bot/installer"))).status).toBe(401);
  });

  it("gives a .bat with a NEW token, the site's own address and the sync address; the old token stops working", async () => {
    const u = await makeUser("paid@x.mn");
    await giveAccess(u);
    session = await reload(u);
    const old = await rotateToken(u.id);
    expect(await ownerOf(old)).toBe(u.id);

    const res = await installer(req("/api/bot/installer", { host: "evil.example", "x-forwarded-host": "evil.example", "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="XauBot-Setup.bat"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body.startsWith("@echo off\r\n")).toBe(true);
    expect(body).not.toMatch(/(?<!\r)\n/); // CRLF only
    expect(body).toContain(`$SiteOrigin = '${ORIGIN}'`);
    expect(body).toContain(`ServerUrl=${ORIGIN}/api/bot/sync`);
    expect(body).not.toContain("evil.example"); // never from the request's headers
    const token = body.match(/BotToken=([0-9a-f]{48})/)?.[1];
    expect(token).toBeTruthy();
    expect(token).not.toBe(old);
    expect(body).toContain(`$BotToken = '${token}'`);
    expect(await ownerOf(old)).toBeNull();
    expect(await ownerOf(token!)).toBe(u.id);
  });

  it("is refused when another site starts the request, and when the site address is not set (no token is made)", async () => {
    const u = await makeUser("paid2@x.mn");
    await giveAccess(u);
    session = await reload(u);
    const old = await rotateToken(u.id);
    expect((await installer(req("/api/bot/installer", { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    delete process.env.APP_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    expect((await installer(req("/api/bot/installer"))).status).toBe(503);
    expect(await ownerOf(old)).toBe(u.id); // still the same token
  });
});

describe("GET /api/bot/download with the robot token", () => {
  it("serves the compiled robot to a valid token of a member with access, without a session", async () => {
    const u = await makeUser("t@x.mn");
    await giveAccess(u);
    const token = await rotateToken(u.id);
    const res = await download(req("/api/bot/download?file=ex5", { "x-bot-token": token }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="XauBot.ex5"');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
  });

  it("refuses a wrong token, a token whose owner has no plan, and the token for anything but the compiled robot", async () => {
    expect((await download(req("/api/bot/download?file=ex5", { "x-bot-token": "f".repeat(48) }))).status).toBe(401);
    const free = await makeUser("free2@x.mn");
    const freeToken = await rotateToken(free.id);
    expect((await download(req("/api/bot/download?file=ex5", { "x-bot-token": freeToken }))).status).toBe(401);
    const u = await makeUser("t2@x.mn");
    await giveAccess(u);
    const token = await rotateToken(u.id);
    expect((await download(req("/api/bot/download?file=mq5", { "x-bot-token": token }))).status).toBe(401);
    expect((await download(req("/api/bot/download?file=ex5"))).status).toBe(401);
  });

  it("still serves a signed-in member without a token", async () => {
    const u = await makeUser("s@x.mn");
    await giveAccess(u);
    session = await reload(u);
    expect((await download(req("/api/bot/download?file=mq5"))).status).toBe(200);
  });
});
