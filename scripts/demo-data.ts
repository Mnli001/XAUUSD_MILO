/**
 * Fills a LOCAL database with synthetic preview data so every page can be seen without API keys:
 * random-walk candles, a year of release dates, and sample trades for the admin. npm run demo
 * Refuses to run against anything but localhost. Real data replaces it on the next backfill.
 */
import { eq } from "drizzle-orm";
import { db, schema, closeDb } from "../src/lib/db";
import type { Candle } from "../src/lib/analysis/indicators";
import { SYMBOL, upsertCandles, recomputeSnapshot } from "../src/lib/ingest/prices";
import { recomputeReactions } from "../src/lib/ingest/calendar";
import { EVENT_TYPES } from "../src/lib/data/calendarProvider";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("demo-data runs only against a localhost database");

let seed = 20261123;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

const Q = 15 * 6e4;
const now = new Date();
const end = Math.floor(now.getTime() / Q) * Q;
const start = end - 420 * 864e5;

function build15(): Candle[] {
  const out: Candle[] = [];
  let p = 2650;
  for (let t = start; t < end; t += Q) {
    const d = new Date(t);
    if (d.getUTCDay() === 6 || (d.getUTCDay() === 0 && d.getUTCHours() < 22)) continue; // market closed
    const h = d.getUTCHours();
    const vol = h >= 12 && h <= 16 ? 2.6 : h >= 7 && h <= 11 ? 1.8 : 1.1; // NY and London move more
    const open = p;
    const close = Math.max(1000, open + 0.05 + gauss() * vol);
    const high = Math.max(open, close) + Math.abs(gauss()) * vol * 0.6;
    const low = Math.min(open, close) - Math.abs(gauss()) * vol * 0.6;
    out.push({ time: d, open, high, low, close });
    p = close;
  }
  return out;
}

function aggregate(src: Candle[], bucket: (d: Date) => number): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of src) {
    const k = bucket(c.time);
    const cur = map.get(k);
    if (!cur) map.set(k, { time: new Date(k), open: c.open, high: c.high, low: c.low, close: c.close });
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  return [...map.values()];
}

async function main() {
  const m15 = build15();
  const H = 36e5;
  await upsertCandles(SYMBOL, "15min", m15);
  await upsertCandles(SYMBOL, "1h", aggregate(m15, (d) => Math.floor(d.getTime() / H) * H));
  await upsertCandles(SYMBOL, "4h", aggregate(m15, (d) => Math.floor(d.getTime() / (4 * H)) * 4 * H));
  await upsertCandles(SYMBOL, "1day", aggregate(m15, (d) => Math.floor(d.getTime() / (24 * H)) * 24 * H));
  console.log(`candles: ${m15.length} x 15min`);

  // Releases at 12:30 / 18:00 UTC on fixed days of each month, a year back and five weeks ahead.
  await db.delete(schema.economicEvents).where(eq(schema.economicEvents.source, "demo"));
  const day = { CPI: 12, NFP: 5, GDP: 27, PCE: 28, PPI: 13, RETAIL: 16, FOMC: 18 } as Record<string, number>;
  const rows = [];
  for (let m = -12; m <= 1; m++) {
    for (const e of EVENT_TYPES) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, day[e.type] ?? 10, e.type === "FOMC" ? 18 : 12, 30));
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + (d.getUTCDay() === 6 ? 2 : 1));
      if (e.type === "FOMC" && m % 2 !== 0) continue;
      rows.push({ type: e.type, title: e.title, country: e.country, impact: e.impact, time: d, source: "demo", forecast: d < now ? null : "—", previous: null, actual: null });
    }
  }
  // One release a few hours from now so the countdown has something to count.
  const soon = new Date(Math.ceil((now.getTime() + 5 * H) / (30 * 6e4)) * 30 * 6e4);
  const cpi = EVENT_TYPES.find((e) => e.type === "CPI")!;
  rows.push({ type: cpi.type, title: cpi.title, country: cpi.country, impact: cpi.impact, time: soon, source: "demo", forecast: "0.3%", previous: "0.2%", actual: null });
  await db.insert(schema.economicEvents).values(rows);
  await recomputeReactions(now);
  await recomputeSnapshot(SYMBOL, now);
  console.log(`events: ${rows.length}`);

  const email = process.env.ADMIN_EMAIL;
  const [admin] = email ? await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())) : [];
  if (admin) {
    await db.delete(schema.trades).where(eq(schema.trades.userId, admin.id));
    const trades = [];
    for (let i = 0; i < 28; i++) {
      const opened = new Date(end - (40 - i * 1.3) * 864e5 - rand() * 6 * H);
      const c = m15.findLast((x) => x.time <= opened) ?? m15[0];
      const buy = rand() > 0.45;
      const risk = 4 + rand() * 6;
      const r = rand() < 0.55 ? 1 + rand() * 1.4 : -1;
      const lots = [0.05, 0.1, 0.1, 0.2][Math.floor(rand() * 4)];
      const entry = Math.round(c.close * 100) / 100;
      const dir = buy ? 1 : -1;
      trades.push({
        userId: admin.id, direction: buy ? ("BUY" as const) : ("SELL" as const), lots, entryPrice: entry,
        exitPrice: Math.round((entry + dir * r * risk) * 100) / 100, stopLoss: Math.round((entry - dir * risk) * 100) / 100, takeProfit: Math.round((entry + dir * risk * 1.5) * 100) / 100,
        openedAt: opened, closedAt: new Date(opened.getTime() + (1 + rand() * 5) * H), note: null,
      });
    }
    await db.insert(schema.trades).values(trades);
    console.log(`trades: ${trades.length} for ${email}`);
  }
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
