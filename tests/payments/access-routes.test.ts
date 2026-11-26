import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/users";
import type { User } from "@/lib/db/schema";

let session: User | null = null;
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session }));
import { GET as candles } from "@/app/api/candles/route";
import { GET as live } from "@/app/api/live/route";
import { GET as exportTrades } from "@/app/api/trades/export/route";
import { GET as reasoning } from "@/app/api/reasoning/route";
import { GET as alerts } from "@/app/api/alerts/route";

const req = (path: string) => new Request(`https://site.mn${path}`);

beforeEach(async () => { await resetDb(); session = null; });

describe("a signed-in user without a plan", () => {
  beforeEach(async () => { session = await makeUser("free@x.mn"); });

  it("gets the price and candles, which are open to everyone signed in", async () => {
    expect((await live()).status).toBe(200);
    expect((await candles(req("/api/candles?tf=bad"))).status).toBe(400); // past the sign-in check, stopped only by the bad timeframe
  });

  it("can export their own journal", async () => {
    expect((await exportTrades()).status).toBe(200);
  });

  it("does not get the paid read or the alerts", async () => {
    expect((await reasoning()).status).toBe(401);
    expect((await alerts()).status).toBe(401);
  });
});

describe("signed out", () => {
  it("gets nothing", async () => {
    expect((await live()).status).toBe(401);
    expect((await candles(req("/api/candles?tf=1h"))).status).toBe(401);
    expect((await exportTrades()).status).toBe(401);
  });
});
