import { db, schema } from "@/lib/db";
import { getQuote, getLiveTick, isGold, recordTick, withLive, FEED_FRESH_MS } from "@/lib/feed";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { handleSync, rotateToken } from "@/lib/bot/liveDb";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

beforeEach(resetDb);
const now = new Date("2026-11-24T10:07:30Z");
const bar = (iso: string, o: number, h: number, l: number, c: number) => ({ time: new Date(iso), open: o, high: h, low: l, close: c });

test("gold is recognised under the names brokers give it", () => {
  for (const s of ["XAUUSD", "XAUUSDm", "xauusd.r", "GOLD", "Gold#"]) expect(isGold(s)).toBe(true);
  for (const s of ["EURUSD", "XAGUSD", "BTCUSD", ""]) expect(isGold(s)).toBe(false);
});
test("a tick is kept for gold only, and never with a price that cannot be real", async () => {
  expect(await recordTick({ symbol: "EURUSD", bid: 1.1, ask: 1.1001 }, now)).toBe(false);
  expect(await recordTick({ symbol: "XAUUSD", bid: 0, ask: 0 }, now)).toBe(false);
  expect(await recordTick({ symbol: "XAUUSD", bid: 4200, ask: 4100 }, now)).toBe(false); // ask under bid
  expect(await recordTick({ symbol: "XAUUSD", bid: 4200, ask: 4400 }, now)).toBe(false); // a 5% spread is a broken quote
  expect(await db.select().from(schema.liveTicks)).toHaveLength(0);
  expect(await recordTick({ symbol: "XAUUSDm", bid: 4200.1, ask: 4200.4, server: "Broker-Live" }, now)).toBe(true);
  expect(await recordTick({ symbol: "XAUUSDm", bid: 4201, ask: 4201.3, server: "Broker-Live" }, new Date(now.getTime() + 1000))).toBe(true);
  expect(await db.select().from(schema.liveTicks)).toMatchObject([{ symbol: SYMBOL, bid: 4201, ask: 4201.3, source: "Broker-Live" }]); // one row, the newest
});
test("the quote is live while the feed is fresh and falls back to the stored candle after", async () => {
  expect(await getQuote(now)).toBeNull();
  await upsertCandles(SYMBOL, "15min", [bar("2026-11-24T10:00:00Z", 4190, 4195, 4188, 4193)]);
  expect(await getQuote(now)).toMatchObject({ price: 4193, live: false, source: "candles", bid: null });
  await recordTick({ symbol: "XAUUSD", bid: 4200.1, ask: 4200.4 }, now);
  expect(await getQuote(now)).toMatchObject({ price: 4200.1, bid: 4200.1, ask: 4200.4, live: true, source: "mt5", at: now.getTime() });
  const later = new Date(now.getTime() + FEED_FRESH_MS + 1);
  expect(await getLiveTick(later)).toBeNull();
  expect(await getQuote(later)).toMatchObject({ price: 4193, live: false, source: "candles" });
});
test("a live price stretches the forming bar and opens the next one when its time comes", () => {
  const candles = [bar("2026-11-24T09:45:00Z", 4180, 4186, 4179, 4185), bar("2026-11-24T10:00:00Z", 4185, 4190, 4184, 4188)];
  const at = (iso: string) => new Date(iso).getTime();
  const same = withLive(candles, "15min", 4196, at("2026-11-24T10:07:30Z"));
  expect(same).toHaveLength(2);
  expect(same[1]).toEqual(bar("2026-11-24T10:00:00Z", 4185, 4196, 4184, 4196));
  expect(candles[1].close).toBe(4188); // the stored candles are left alone
  expect(withLive(candles, "15min", 4170, at("2026-11-24T10:14:59Z"))[1]).toMatchObject({ low: 4170, close: 4170, high: 4190 });
  const next = withLive(candles, "15min", 4191, at("2026-11-24T10:32:00Z"));
  expect(next).toHaveLength(3);
  expect(next[2]).toEqual(bar("2026-11-24T10:30:00Z", 4191, 4191, 4191, 4191)); // aligned to the bars before it
  expect(withLive(candles, "1h", 4199, at("2026-11-24T10:59:00Z"))).toHaveLength(2);
  expect(withLive(candles, "15min", 4199, at("2026-11-24T09:00:00Z"))).toBe(candles); // older than the last bar
  expect(withLive([], "15min", 4199, 1)).toEqual([]);
  // the chart keeps its times as numbers
  expect(withLive([{ time: 1000, open: 1, high: 2, low: 1, close: 2 }], "15min", 3, 1000 + 16 * 6e4)[1]).toMatchObject({ time: 1000 + 15 * 6e4, open: 3 });
});
test("only the owner's robot feeds the site's price", async () => {
  const report = (bid: number) => ({ account: { login: "7001", server: "Broker-Demo", mode: "DEMO", balance: 1000, equity: 1000 }, symbol: "XAUUSD", bid, ask: bid + 0.3, signal: "NONE", reason: "", runPnl: 0, positions: [], deals: [], finished: "" });
  const user = await makeUser("u@x.mn");
  const userToken = await rotateToken(user.id);
  expect(await handleSync(userToken, report(4100), now)).not.toBeNull();
  expect(await getQuote(now)).toBeNull(); // a subscriber's terminal moves nobody's chart
  const admin = await makeUser("owner@x.mn", "ADMIN");
  const adminToken = await rotateToken(admin.id);
  expect(await handleSync(adminToken, report(4205.5), now)).not.toBeNull();
  expect(await getQuote(now)).toMatchObject({ price: 4205.5, live: true, source: "mt5" });
});
