/** One-off history load: npm run backfill */
import { TwelveData } from "../src/lib/data/twelveData";
import { upsertCandles, recomputeSnapshot, SYMBOL } from "../src/lib/ingest/prices";
import { closeDb } from "../src/lib/db";
import type { Timeframe } from "../src/lib/analysis/indicators";

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
  const provider = new TwelveData(key);
  for (const { tf, size, days } of PLAN) {
    let endDate: Date | undefined;
    let total = 0;
    const stopAt = Date.now() - days * 864e5;
    for (;;) {
      const candles = await provider.fetchCandles(SYMBOL, tf, { outputsize: size, endDate });
      total += await upsertCandles(SYMBOL, tf, candles);
      await sleep(8000); // free plan: 8 credits per minute
      if (days === 0 || candles.length < size || candles[0].time.getTime() <= stopAt) break;
      endDate = candles[0].time;
    }
    console.log(`${tf}: ${total} лаа хадгаллаа`);
  }
  await recomputeSnapshot(SYMBOL, new Date());
  console.log("Snapshot тооцоолж дууслаа");
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
