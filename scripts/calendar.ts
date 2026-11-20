/** Loads release dates straight from FRED: npm run calendar -- 1100   (days of history, default 365) */
import { FredCalendar } from "../src/lib/data/fredCalendar";
import { ingestCalendar } from "../src/lib/ingest/calendar";
import { closeDb } from "../src/lib/db";
import { withRetry } from "../src/lib/retry";

async function main() {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY тохируулаагүй байна");
  const days = Math.min(Math.max(Number(process.argv[2]) || 365, 30), 3650);
  const r = await withRetry(async () => {
    const res = await ingestCalendar(new FredCalendar(key), new Date(), days);
    if (!res.ok) throw new Error(res.error);
    return res;
  }, { attempts: 6, delayMs: 10_000, onRetry: (n, e) => console.log(`  ${(e as Error).message} — ${n * 10} секундын дараа дахин оролдоно (${n}/5)`) });
  console.log(`${days} хоногийн түүхтэй ${r.stored} мэдээний огноо боловсрууллаа`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
