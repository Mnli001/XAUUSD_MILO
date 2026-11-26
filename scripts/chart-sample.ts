/** Draws the newest stored signal (or a made-up one) as the Telegram result picture:  npx tsx --env-file=.env scripts/chart-sample.ts out.png */
import { writeFileSync } from "node:fs";
import { loadCandles, SYMBOL } from "../src/lib/ingest/prices";
import { closeDb } from "../src/lib/db";
import { tradeChartPng } from "../src/lib/tradeChart";
import { signalOutcome } from "../src/lib/signalOutcome";
import { listSignals } from "../src/lib/signals";
import { formatTime } from "../src/lib/time";

async function main() {
  const bars = await loadCandles(SYMBOL, "15min", 400);
  const [s] = await listSignals(1);
  const sig = s ?? { setupId: "asian-breakout", side: "BUY", entry: bars[300].close, stop: bars[300].close - 8, target: bars[300].close + 24, createdAt: new Date(bars[300].time.getTime() + 15 * 6e4) };
  const o = signalOutcome(sig, bars, new Date());
  const exitPrice = o.kind === "WIN" ? sig.target : o.kind === "LOSS" ? sig.stop : bars.at(-1)!.close;
  const png = await tradeChartPng({
    bars, side: sig.side as "BUY" | "SELL", entry: sig.entry, stop: sig.stop, target: sig.target, openedAt: sig.createdAt,
    exit: o.at ? { at: o.at, price: exitPrice, kind: o.kind === "OPEN" ? "TIME" : o.kind } : null,
    title: `${o.kind === "WIN" ? "✅ TP хүрлээ" : o.kind === "LOSS" ? "❌ SL хүрлээ" : "⏱ Цагаар хаагдлаа"} · ${sig.side} XAUUSD`,
    subtitle: `Азийн хүрээний breakout · ${o.r ?? 0}R · орсон ${sig.entry.toFixed(2)}`,
    clock: (d) => formatTime(d, "Asia/Ulaanbaatar"),
  });
  writeFileSync(process.argv[2] ?? "chart.png", png!);
  console.log("written", png?.length, o);
  await closeDb();
}
main();
