/**
 * One-off history load.
 *   npm run backfill              — all timeframes
 *   npm run backfill -- 15min     — only the timeframes named (15min, 1h, 4h, 1day)
 * Network failures are retried; a timeframe that still fails is skipped and reported at the end.
 */
import { TwelveData } from "../src/lib/data/twelveData";
import { upsertCandles, recomputeSnapshot, SYMBOL } from "../src/lib/ingest/prices";
import { closeDb } from "../src/lib/db";
import { withRetry } from "../src/lib/retry";
import { TIMEFRAMES, type Timeframe } from "../src/lib/analysis/indicators";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PLAN: { tf: Timeframe; size: number; days: number }[] = [
  { tf: "1day", size: 400, days: 0 },
  { tf: "4h", size: 1500, days: 0 },
  { tf: "1h", size: 5000, days: 0 },
  { tf: "15min", size: 5000, days: 365 },
];

async function main() {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("TWELVEDATA_API_KEY тохируулаагүй байна");
  const wanted = process.argv.slice(2).filter((a): a is Timeframe => (TIMEFRAMES as string[]).includes(a));
  const plan = wanted.length ? PLAN.filter((p) => wanted.includes(p.tf)) : PLAN;
  const provider = new TwelveData(key);
  const failed: string[] = [];

  for (const { tf, size, days } of plan) {
    let endDate: Date | undefined;
    let total = 0;
    const stopAt = Date.now() - days * 864e5;
    try {
      for (;;) {
        const candles = await withRetry(() => provider.fetchCandles(SYMBOL, tf, { outputsize: size, endDate }), {
          attempts: 6,
          delayMs: 10_000,
          onRetry: (n, e) => console.log(`  ${tf}: ${(e as Error).message} — ${n * 10} секундын дараа дахин оролдоно (${n}/5)`),
        });
        total += await upsertCandles(SYMBOL, tf, candles);
        console.log(`  ${tf}: ${total} лаа…`);
        await sleep(8000); // free plan: 8 credits per minute
        if (days === 0 || candles.length < size || candles[0].time.getTime() <= stopAt) break;
        endDate = candles[0].time;
      }
      console.log(`${tf}: ${total} лаа хадгаллаа`);
    } catch (e) {
      failed.push(tf);
      console.error(`${tf}: АМЖИЛТГҮЙ (${total} лаа хадгалагдсан) — ${(e as Error).message}`);
    }
  }

  await recomputeSnapshot(SYMBOL, new Date());
  console.log("Snapshot тооцоолж дууслаа");
  await closeDb();
  if (failed.length) {
    console.error(`\nДутуу үлдсэн: ${failed.join(", ")}. Дахин ажиллуулах: npm run backfill -- ${failed.join(" ")}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
