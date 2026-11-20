/** Compares the pre-declared rule variants with a train / validation split: npm run variants */
import { eq } from "drizzle-orm";
import { db, schema, closeDb } from "../src/lib/db";
import { loadCandles, SYMBOL } from "../src/lib/ingest/prices";
import { compareVariants, pickBest, passesValidation, MIN_TEST_TRADES, MIN_TEST_AVG_R, MIN_TEST_PROFIT_FACTOR, type SegmentStats } from "../src/lib/bot/variants";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const f = (v: number | null, digits = 2) => (v === null ? "  —  " : v.toFixed(digits));
const seg = (s: SegmentStats) => `${String(s.n).padStart(4)} ${f(s.winRate, 0).padStart(4)}% ${f(s.profitFactor).padStart(5)} ${f(s.avgR).padStart(6)} ${f(s.totalR, 1).padStart(6)} ${f(s.maxDrawdownR, 1).padStart(5)}`;

async function main() {
  const [m15, h1, h4, d1, events] = await Promise.all([
    loadCandles(SYMBOL, "15min", 60_000), loadCandles(SYMBOL, "1h", 20_000), loadCandles(SYMBOL, "4h", 10_000), loadCandles(SYMBOL, "1day", 3_000),
    db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(eq(schema.economicEvents.impact, "HIGH")),
  ]);
  const { rows, from, splitAt, to } = compareVariants({ m15, h1, h4, d1, news: events.map((e) => e.time) });
  console.log(`Сонгох хэсэг:        ${day(from)} → ${day(splitAt)}`);
  console.log(`Баталгаажуулах хэсэг: ${day(splitAt)} → ${day(to)}\n`);
  const head = "   n  win    PF   avgR   нийтR  уналт";
  console.log(`${"Хувилбар".padEnd(42)}| СОНГОХ ${head} | БАТАЛГААЖУУЛАХ ${head}`);
  for (const r of rows) console.log(`${r.name.padEnd(42)}|        ${seg(r.train)} |                ${seg(r.test)}`);

  const best = pickBest(rows);
  console.log("");
  if (!best) {
    console.log("ДҮГНЭЛТ: Сонгох хэсэгт ашигтай гарсан хувилбар алга. Эдгээр дүрмийн аль нь ч давуу талгүй.");
  } else {
    const ok = passesValidation(best.test);
    console.log(`Сонгох хэсгээр шилдэг нь: “${best.name}” (avgR ${f(best.train.avgR)}, ${best.train.n} арилжаа)`);
    console.log(`Түүний харж байгаагүй хэсэг дээрх үр дүн: ${best.test.n} арилжаа, avgR ${f(best.test.avgR)}, PF ${f(best.test.profitFactor)}`);
    console.log(`Шалгуур: ≥${MIN_TEST_TRADES} арилжаа, avgR ≥ ${MIN_TEST_AVG_R}, PF ≥ ${MIN_TEST_PROFIT_FACTOR}`);
    console.log(`\nДҮГНЭЛТ: ${ok ? "ТЭНЦСЭН — харж байгаагүй дата дээр ч ашигтай. Demo дээр шалгах үндэслэлтэй (баталгаа биш)." : "ТЭНЦЭЭГҮЙ — сонгосон хэсэгтээ сайн харагдсан ч шинэ дата дээр батлагдаагүй."}`);
  }
  console.log("\navgR = нэг арилжааны дундаж үр дүн, эрсдэлийн нэгжээр (1R = нэг арилжаанд эрсдэлд оруулсан мөнгө).");
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
