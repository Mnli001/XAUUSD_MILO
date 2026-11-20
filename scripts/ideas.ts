/** Compares three different entry ideas with a train / validation split: npm run ideas */
import { closeDb } from "../src/lib/db";
import { loadBacktestData } from "../src/lib/bot/run";
import { compareIdeas } from "../src/lib/bot/ideas";
import { pickBest, passesValidation, MIN_TRAIN_TRADES, MIN_TEST_TRADES, MIN_TEST_AVG_R, MIN_TEST_PROFIT_FACTOR, type SegmentStats } from "../src/lib/bot/variants";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const f = (v: number | null, digits = 2) => (v === null ? "  —  " : v.toFixed(digits));
const seg = (s: SegmentStats) => `${String(s.n).padStart(4)} ${f(s.winRate, 0).padStart(4)}% ${f(s.profitFactor).padStart(5)} ${f(s.avgR).padStart(6)} ${f(s.totalR, 1).padStart(6)} ${f(s.maxDrawdownR, 1).padStart(5)}`;

async function main() {
  const data = await loadBacktestData();
  console.log(`Дата: 15м ${data.m15.length} лаа (${day(data.m15[0]?.time ?? null)} → ${day(data.m15.at(-1)?.time ?? null)}), чухал мэдээ ${data.news.length}`);
  const { rows, from, splitAt, to } = compareIdeas(data);
  console.log(`Сонгох хэсэг:         ${day(from)} → ${day(splitAt)}`);
  console.log(`Баталгаажуулах хэсэг: ${day(splitAt)} → ${day(to)}\n`);
  const head = "   n  win    PF   avgR   нийтR  уналт";
  console.log(`${"Санаа".padEnd(42)}| СОНГОХ ${head} | БАТАЛГААЖУУЛАХ ${head}`);
  for (const r of rows) console.log(`${r.name.padEnd(42)}|        ${seg(r.train)} |                ${seg(r.test)}`);

  const best = pickBest(rows);
  console.log("");
  if (!best) {
    console.log(`ДҮГНЭЛТ: Сонгох хэсэгт ашигтай (≥${MIN_TRAIN_TRADES} арилжаатай) санаа алга.`);
  } else {
    const ok = passesValidation(best.test);
    console.log(`Сонгох хэсгээр шилдэг нь: “${best.name}” (avgR ${f(best.train.avgR)}, ${best.train.n} арилжаа)`);
    console.log(`Түүний харж байгаагүй хэсэг дээрх үр дүн: ${best.test.n} арилжаа, avgR ${f(best.test.avgR)}, PF ${f(best.test.profitFactor)}`);
    console.log(`Шалгуур: ≥${MIN_TEST_TRADES} арилжаа, avgR ≥ ${MIN_TEST_AVG_R}, PF ≥ ${MIN_TEST_PROFIT_FACTOR}`);
    console.log(`\nДҮГНЭЛТ: ${ok ? "ТЭНЦСЭН — харж байгаагүй дата дээр ч ашигтай. Demo дээр шалгах үндэслэлтэй (баталгаа биш)." : "ТЭНЦЭЭГҮЙ — шинэ дата дээр батлагдаагүй."}`);
  }
  console.log("\nАнхаар: өмнөх 13 хувилбартай нийлээд одоо 19 дүрэм шалгагдлаа. Олон дүрэм шалгах тусам нэг нь азаар тэнцэх магадлал өснө.");
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
