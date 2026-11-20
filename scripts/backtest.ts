/** Prints a backtest of the default bot rules over the stored history: npm run backtest */
import { runBacktestFromDb } from "../src/lib/bot/run";
import { closeDb } from "../src/lib/db";

const VERDICT = {
  INSUFFICIENT: "ДҮГНЭХЭД ЭРТ — арилжаа 30-аас цөөн",
  LOSING: "АЛДАГДАЛТАЙ — энэ дүрмээр бот ажиллуулж болохгүй",
  MARGINAL: "ЗААГ ДЭЭР — ашиг бага эсвэл уналт их",
  PROMISING: "БОЛОМЖИЙН — demo дээр үргэлжлүүлэн шалгах үнэ цэнэтэй (баталгаа биш)",
};
const usd = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  const r = await runBacktestFromDb();
  const s = r.stats;
  console.log(`Хугацаа:            ${day(r.from)} → ${day(r.to)}`);
  console.log(`Дохио / арилжаа:    ${r.signalCount} / ${s.count}`);
  console.log(`Win rate:           ${s.winRate === null ? "—" : s.winRate.toFixed(1) + "%"}`);
  console.log(`Profit factor:      ${s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)}`);
  console.log(`Дундаж R:           ${s.avgR === null ? "—" : s.avgR.toFixed(2)}`);
  console.log(`Нийт P&L:           ${usd(s.totalPnl)} (${r.returnPct.toFixed(2)}%) — эхлэх данс ${usd(r.startBalance)}`);
  console.log(`Хамгийн их уналт:   ${r.maxDrawdownPct.toFixed(2)}%`);
  console.log(`Kill switch:        ${r.killSwitchAt ? day(r.killSwitchAt) + "-нд асах байсан" : "асаагүй"}`);
  console.log(`Гарсан шалтгаан:    TP ${r.byReason.TP} · SL ${r.byReason.SL} · BE ${r.byReason.BE} · амралт ${r.byReason.WEEKEND} · төгсгөл ${r.byReason.END}`);
  console.log("Сараар:");
  for (const m of r.months) console.log(`  ${m.month}  ${String(m.trades).padStart(3)} арилжаа  ${usd(m.pnl)}`);
  console.log(`\nДҮГНЭЛТ: ${VERDICT[r.verdict]}`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
