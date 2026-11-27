import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import type { Candle } from "@/lib/analysis/indicators";
import { MAX_CONDITION_ALERTS, checkConditionAlerts, conditionHit, createConditionAlert, deleteConditionAlert, listConditionAlerts } from "@/lib/conditionAlerts";
import type { PushMessage } from "@/lib/push";

const H = 36e5, M15 = 9e5;
const bars = (closes: number[], start: number, step: number, o: Partial<Candle>[] = []): Candle[] =>
  closes.map((c, i) => ({ time: new Date(start + i * step), open: c, high: c + 0.5, low: c - 0.5, close: c, ...o[i] }));
const start = Date.UTC(2026, 10, 1);

describe("the conditions themselves", () => {
  it("RSI below a level fires on the bar that crosses it, not on the bars after", () => {
    const up = Array.from({ length: 40 }, (_, i) => 3600 + i * 0.2 + (i % 2 ? 0.6 : -0.6));
    const fall = [...up, 3600, 3590, 3580, 3570, 3560];
    const c = bars(fall, start, H);
    const hits = c.map((_, i) => (i < 30 ? null : conditionHit({ kind: "rsi_below", value: 30 }, c.slice(0, i + 1), [])));
    const first = hits.findIndex((h) => h);
    expect(first).toBeGreaterThan(39);
    expect(hits.slice(first + 1).every((h) => !h)).toBe(true);
    expect(hits[first]!.actual!).toBeLessThan(30);
  });
  it("an EMA 50 / 200 cross up fires once", () => {
    const closes = [...Array(220).fill(3600).map((v, i) => v - i * 0.05), ...Array.from({ length: 80 }, (_, i) => 3590 + i * 1.5)];
    const c = bars(closes, start, H);
    const hits = c.map((_, i) => (i < 210 ? null : conditionHit({ kind: "ema_cross_up", value: null }, c.slice(0, i + 1), [])));
    expect(hits.filter(Boolean)).toHaveLength(1);
  });
  it("yesterday's high: a close above is a break, a poke above that closes back below is a sweep", () => {
    const day = [{ time: new Date(start), open: 3590, high: 3610, low: 3580, close: 3600 }];
    const base = bars([3600, 3605, 3608], start + 24 * H, M15);
    const breakBar = { time: new Date(start + 24 * H + 3 * M15), open: 3608, high: 3614, low: 3607, close: 3612 };
    const sweepBar = { time: new Date(start + 24 * H + 3 * M15), open: 3608, high: 3613, low: 3605, close: 3606 };
    expect(conditionHit({ kind: "prev_high_break", value: null }, [...base, breakBar], day)).toBeTruthy();
    expect(conditionHit({ kind: "prev_high_sweep", value: null }, [...base, breakBar], day)).toBeNull();
    expect(conditionHit({ kind: "prev_high_sweep", value: null }, [...base, sweepBar], day)).toBeTruthy();
    expect(conditionHit({ kind: "prev_high_break", value: null }, [...base, sweepBar], day)).toBeNull();
  });
});

describe("stored alerts", () => {
  let sent: string[];
  let pushed: PushMessage[];
  const deps = { send: async (_c: string, html: string) => { sent.push(html); return true; }, push: async (_u: string, m: PushMessage) => { pushed.push(m); return 1; } };
  beforeEach(async () => { await resetDb(); sent = []; pushed = []; });

  it("validate their kind, timeframe and level, and are capped per user", async () => {
    const u = await makeUser("a@x.mn");
    expect((await createConditionAlert(u.id, { kind: "rsi_below", timeframe: "1h", value: 30 })).error).toBeUndefined();
    expect((await createConditionAlert(u.id, { kind: "rsi_below", timeframe: "1h", value: 120 })).error).toBe("value");
    expect((await createConditionAlert(u.id, { kind: "nope" as never, timeframe: "1h", value: null })).error).toBe("kind");
    expect((await createConditionAlert(u.id, { kind: "ema_cross_up", timeframe: "1day" as never, value: null })).error).toBe("timeframe");
    for (let i = 1; i < MAX_CONDITION_ALERTS; i++) await createConditionAlert(u.id, { kind: "ema_cross_up", timeframe: "4h", value: null });
    expect((await createConditionAlert(u.id, { kind: "ema_cross_up", timeframe: "4h", value: null })).error).toBe("limit");
    const [first] = await listConditionAlerts(u.id);
    await deleteConditionAlert(u.id, first.id);
    expect(await listConditionAlerts(u.id)).toHaveLength(MAX_CONDITION_ALERTS - 1);
  });

  it("fire on a new closed bar for members with a plan, once per bar, by Telegram and push", async () => {
    const u = await makeUser("a@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = '111' WHERE id = ${u.id}`);
    await createConditionAlert(u.id, { kind: "prev_high_break", timeframe: "15min", value: null }, new Date(start + 24 * H));
    await upsertCandles(SYMBOL, "1day", [{ time: new Date(start), open: 3590, high: 3610, low: 3580, close: 3600 }]);
    const m15 = [...bars([3600, 3605, 3608], start + 24 * H, M15), { time: new Date(start + 24 * H + 3 * M15), open: 3608, high: 3614, low: 3607, close: 3612 }, { time: new Date(start + 24 * H + 4 * M15), open: 3612, high: 3613, low: 3611, close: 3612 }];
    await upsertCandles(SYMBOL, "15min", m15);
    const now = new Date(start + 24 * H + 5 * M15 + 60e3);
    expect(await checkConditionAlerts(now, deps)).toBe(1);
    expect(await checkConditionAlerts(new Date(now.getTime() + 60e3), deps)).toBe(0); // same bar
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("3610.00");
    expect(pushed[0].url).toBe("/today#alerts");
    const [row] = await listConditionAlerts(u.id);
    expect(row.lastFiredAt).not.toBeNull();
  });

  it("stay quiet without a plan", async () => {
    const u = await makeUser("a@x.mn");
    await db.execute(sql`UPDATE users SET access_until = '2020-01-01', telegram_chat_id = '111' WHERE id = ${u.id}`);
    await createConditionAlert(u.id, { kind: "prev_high_break", timeframe: "15min", value: null }, new Date(start + 24 * H));
    await upsertCandles(SYMBOL, "1day", [{ time: new Date(start), open: 3590, high: 3610, low: 3580, close: 3600 }]);
    await upsertCandles(SYMBOL, "15min", [...bars([3600, 3608], start + 24 * H, M15), { time: new Date(start + 24 * H + 2 * M15), open: 3608, high: 3614, low: 3607, close: 3612 }, { time: new Date(start + 24 * H + 3 * M15), open: 3612, high: 3613, low: 3611, close: 3612 }]);
    expect(await checkConditionAlerts(new Date(start + 24 * H + 4 * M15 + 60e3), deps)).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
