import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";

const getSetups = vi.fn(async () => ({ setups: [{ id: "asian-breakout", status: "ACTIVE", at: new Date("2026-11-27T09:45:00Z") }, { id: "ny-open-breakout", status: "WAITING", at: null }] }));
vi.mock("@/lib/setup/build", () => ({ getSetups: () => getSetups() }));
vi.mock("@/lib/events", () => ({ getNextHighEvent: async () => null }));

import { forgetAlertsFeed, getAlertsFeed } from "@/lib/alertsFeed";

const bar = (iso: string) => db.insert(schema.candles).values({ symbol: "XAUUSD", timeframe: "15min", time: new Date(iso), open: 1, high: 2, low: 0, close: 1 });
const TTL = 60_000;

beforeEach(async () => { await resetDb(); forgetAlertsFeed(); getSetups.mockClear(); });

describe("the alerts feed", () => {
  it("is worked out once per 15-minute bar, again for a new bar, and again once its time is up", async () => {
    await bar("2026-11-27T09:45:00Z");
    const now = new Date("2026-11-27T10:01:00Z");
    const first = await getAlertsFeed(now, TTL);
    expect(first).toEqual({ active: ["asian-breakout@2026-11-27T09:45:00.000Z"], nextRelease: null });
    await Promise.all([getAlertsFeed(new Date(now.getTime() + 5_000), TTL), getAlertsFeed(new Date(now.getTime() + 30_000), TTL)]);
    expect(getSetups).toHaveBeenCalledTimes(1);
    await bar("2026-11-27T10:00:00Z");
    await getAlertsFeed(new Date(now.getTime() + 40_000), TTL);
    expect(getSetups).toHaveBeenCalledTimes(2);
    await getAlertsFeed(new Date(now.getTime() + 40_000 + TTL), TTL);
    expect(getSetups).toHaveBeenCalledTimes(3);
  });

  it("shares one computation between requests that arrive together, and forgets a failed one", async () => {
    await bar("2026-11-27T09:45:00Z");
    const now = new Date("2026-11-27T10:01:00Z");
    await Promise.all([getAlertsFeed(now, TTL), getAlertsFeed(now, TTL), getAlertsFeed(now, TTL)]);
    expect(getSetups).toHaveBeenCalledTimes(1);
    forgetAlertsFeed();
    getSetups.mockRejectedValueOnce(new Error("db down"));
    await expect(getAlertsFeed(now, TTL)).rejects.toThrow("db down");
    expect((await getAlertsFeed(now, TTL)).active).toHaveLength(1);
  });
});
