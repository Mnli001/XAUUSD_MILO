"use client";
import { useState } from "react";
import type { BotChartTrade } from "@/lib/botChart";
import { useViewer } from "./PrefsProvider";
import { Dir } from "./Timetable";

const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-zinc-200");
const PAGE = 20;
const DAY = 864e5;

/** Sums for the history's head: today (on the viewer's calendar), the last 7 days, and everything listed. */
export function historyTotals(trades: readonly BotChartTrade[], now: number, sameDay: (a: Date, b: Date) => boolean) {
  const sum = (xs: readonly BotChartTrade[]) => ({ pnl: Math.round(xs.reduce((s, x) => s + x.profit, 0) * 100) / 100, n: xs.length, wins: xs.filter((x) => x.profit > 0).length });
  return {
    today: sum(trades.filter((x) => sameDay(new Date(x.closedAt), new Date(now)))),
    week: sum(trades.filter((x) => now - Date.parse(x.closedAt) <= 7 * DAY)),
    all: sum(trades),
  };
}

/** The robot's closed trades with their profit or loss; picking one shows it on the chart above. */
export function BotTradeHistory({ trades, onPick, now }: { trades: BotChartTrade[]; onPick: (at: number) => void; now: number }) {
  const v = useViewer();
  const { t } = v;
  const [count, setCount] = useState(PAGE);
  const totals = historyTotals(trades, now, (a, b) => v.date(a) === v.date(b));
  const box = (label: string, s: { pnl: number; n: number; wins: number }) => (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
      <dt className="text-xs font-semibold text-zinc-400">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${tone(s.pnl)}`}>{usd(s.pnl)}</dd>
      <dd className="text-xs text-zinc-500 tabular-nums">{t(`${s.n} арилжаа`, `${s.n} trades`)}{s.n > 0 ? t(` · ${Math.round((s.wins / s.n) * 100)}% ашигтай`, ` · ${Math.round((s.wins / s.n) * 100)}% in profit`) : ""}</dd>
    </div>
  );
  return (
    <section className="space-y-4" aria-labelledby="history-h">
      <h2 id="history-h" className="text-lg font-semibold text-zinc-100">{t("Ботын түүх", "Bot history")}</h2>
      {trades.length === 0 ? (
        <p className="card text-sm text-zinc-400">{t("Робот одоогоор арилжаа хаагаагүй. Хаах бүрд ашиг, алдагдал нь энд болон чарт дээр гарна.", "The robot has not closed a trade yet. Each one it closes shows here and on the chart, with its profit or loss.")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {box(t("Өнөөдөр", "Today"), totals.today)}
            {box(t("Сүүлийн 7 хоног", "Last 7 days"), totals.week)}
            {box(t(`Нийт (сүүлийн ${trades.length})`, `All (last ${trades.length})`), totals.all)}
          </dl>
          <div className="table-card">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-zinc-800">
                {([[`${t("Хаасан", "Closed")} (${v.zone})`, ""], ["", ""], [t("Lot", "Lots"), "hidden sm:table-cell text-right"], [t("Нээсэн → хаасан", "Open → close"), "hidden md:table-cell text-right"], [t("Ашиг/алдагдал", "Profit/loss"), "text-right"], ["", "w-0"]] as const).map(([h, cls], i) => <th key={i} className={`th ${cls}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {trades.slice(0, count).map((x) => {
                  const won = x.profit > 0, lost = x.profit < 0;
                  return (
                    <tr key={x.ticket} data-result={won ? "win" : lost ? "loss" : "flat"} className={`border-t border-zinc-800/70 first:border-t-0 ${won ? "bg-emerald-500/[0.06] shadow-[inset_3px_0_0_var(--color-emerald-400)]" : lost ? "bg-red-500/[0.06] shadow-[inset_3px_0_0_var(--color-red-400)]" : ""}`}>
                      <td className="td whitespace-nowrap text-zinc-400 tabular-nums">{v.dateTime(new Date(x.closedAt)).slice(5)}</td>
                      <td className={`td font-semibold whitespace-nowrap ${x.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}><Dir d={x.side === "BUY" ? 1 : -1} /> {x.side}</td>
                      <td className="td hidden text-right text-zinc-300 tabular-nums sm:table-cell">{x.lots.toFixed(2)}</td>
                      <td className="td hidden text-right text-zinc-400 tabular-nums md:table-cell">{px(x.openPrice)} → {px(x.closePrice)}</td>
                      <td className={`td text-right font-semibold tabular-nums ${tone(x.profit)}`}>{usd(x.profit)}</td>
                      <td className="td text-right">
                        <button type="button" onClick={() => onPick(Date.parse(x.openedAt ?? x.closedAt))} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-amber-300 hover:bg-zinc-800 hover:text-amber-200 whitespace-nowrap">{t("Чартад", "On chart")}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {count < trades.length && <button type="button" onClick={() => setCount((c) => c + PAGE)} className="btn-ghost">{t(`Цааш харах (${trades.length - count})`, `Show more (${trades.length - count})`)}</button>}
        </>
      )}
    </section>
  );
}
