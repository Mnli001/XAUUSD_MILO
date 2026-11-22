import { runBacktestFromDb, paramsFromQuery } from "@/lib/bot/run";
import { EquityCurve } from "@/components/EquityCurve";
import { usd, pnlClass } from "@/lib/format";
import { formatUbDateTime, ubDateKey } from "@/lib/time";
import type { Verdict, ExitReason } from "@/lib/bot/backtest";
import { getViewer } from "@/lib/prefs.server";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const verdictOf = (t: T): Record<Verdict, { title: string; body: string; cls: string }> => ({
  INSUFFICIENT: { title: t("Дүгнэхэд эрт", "Too early to judge"), body: t("Арилжааны тоо 30-аас цөөн тул статистик найдваргүй. Илүү урт түүх татах эсвэл шүүлтүүрийг сулруулж үзнэ.", "Fewer than 30 trades, so the statistics are unreliable. Load a longer history or loosen the filters."), cls: "border-zinc-600 text-zinc-200" },
  LOSING: { title: t("Алдагдалтай", "Losing"), body: t("Энэ тохиргоо өнгөрсөн хугацаанд мөнгө алдсан. Ийм дүрмээр бот ажиллуулж болохгүй.", "This configuration lost money in the past. Do not run a bot on these rules."), cls: "border-red-500/60 text-red-300" },
  MARGINAL: { title: t("Зааг дээр", "Borderline"), body: t("Ашиг бага эсвэл уналт их. Бодит зардал (slippage, swap) нэмэгдэхэд алдагдал руу орж магадгүй.", "Small profit or deep drawdown. Once real costs (slippage, swap) are added it may turn into a loss."), cls: "border-amber-500/60 text-amber-300" },
  PROMISING: { title: t("Боломжийн", "Reasonable"), body: t("Өнгөрсөн дата дээр ашигтай гарсан. Энэ бол баталгаа биш: demo данс дээр бодит цагт шалгах дараагийн алхмын үндэслэл л юм.", "Profitable on past data. That is not a guarantee: it only justifies the next step, checking it in real time on a demo account."), cls: "border-emerald-500/60 text-emerald-300" },
});
const reasonOf = (t: T): Record<ExitReason, string> => ({ TP: "Target", SL: "Stop", BE: t("Тэг (breakeven)", "Breakeven"), TIME: t("Хугацаа дууссан", "Time expired"), WEEKEND: t("Амралтын өмнө", "Before the weekend"), END: t("Түүхийн төгсгөл", "End of history") });

const fieldsOf = (t: T): [string, string, string][] => ([
  ["minBias", t("Хамгийн бага оноо", "Minimum score"), "1"], ["atrMult", "Stop = ATR ×", "0.1"], ["rr", "Target = stop ×", "0.1"], ["riskPct", t("Эрсдэл, %", "Risk, %"), "0.05"],
  ["maxTradesPerDay", t("Өдөрт арилжаа", "Trades per day"), "1"], ["dailyLossPct", t("Өдрийн алдагдлын хязгаар, %", "Daily loss limit, %"), "0.1"], ["maxDrawdownPct", "Kill switch, %", "0.5"],
  ["sessionStartUb", t("Эхлэх цаг (УБ)", "Start hour (UB)"), "1"], ["sessionEndUb", t("Дуусах цаг (УБ)", "End hour (UB)"), "1"], ["newsBeforeMin", t("Мэдээний өмнө, мин", "Before news, min"), "5"],
  ["newsAfterMin", t("Мэдээний дараа, мин", "After news, min"), "5"], ["spread", "Spread, $", "0.05"], ["startBalance", t("Эхлэх данс, $", "Starting balance, $"), "100"],
]);

export default async function BotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await getViewer();
  const { t } = v;
  const VERDICT = verdictOf(t), REASON = reasonOf(t), FIELDS = fieldsOf(t);
  // a checkbox paired with a hidden fallback arrives as two values; the last one wins
  const q = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v.at(-1) : v]));
  const { params, startBalance } = paramsFromQuery(q);
  const values: Record<string, number | boolean> = { ...params, startBalance };
  const r = q.run ? await runBacktestFromDb(params, startBalance) : null;
  const s = r?.stats;
  return (
    <div className="space-y-4">
      <div>
        <a href="/admin/bot" className="text-sm text-zinc-400 hover:text-zinc-50">{t("← Бот", "← Bot")}</a>
        <h1 className="mt-1 text-xl font-semibold">{t("Бот — backtest", "Bot — backtest")}</h1>
        <p className="text-sm text-zinc-400">{t("Арилжааны дүрмийг баазад байгаа түүхэн дата дээр ажиллуулж шалгана. Жинхэнэ болон demo захиалга өгөхгүй.", "Runs the trading rules over the historical data in the database. No live or demo orders are placed.")} <a href="/admin/bot/paper" className="text-amber-400">{t("Цаасан арилжаа →", "Paper trading →")}</a></p>
      </div>

      <form className="card space-y-3">
        <input type="hidden" name="run" value="1" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FIELDS.map(([name, label, step]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input className="input" id={name} name={name} type="number" step={step} defaultValue={Number(values[name])} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="hidden" name="breakeven" value="0" /><input type="checkbox" name="breakeven" value="1" defaultChecked={params.breakeven} /> {t("+1R-д stop-ыг орсон үнэ рүү зөөх", "Move the stop to entry at +1R")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="requireH1Agree" value="1" defaultChecked={params.requireH1Agree} /> {t("1 цагийн чарт мөн тохирсон байх", "The 1-hour chart must agree too")}</label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn">{t("Backtest ажиллуулах", "Run backtest")}</button>
          <a href="/admin/bot/backtest" className="btn-ghost">{t("Анхны тохиргоо", "Default settings")}</a>
          <span className="text-xs text-zinc-500">{t("Тохиргоог олон дахин өөрчилж хамгийн сайн тоог хайх нь өнгөрсөн датад тааруулах эрсдэлтэй.", "Changing the settings again and again to find the best number risks fitting them to the past.")}</span>
        </div>
      </form>

      {!r && <div className="card text-zinc-400">{t("“Backtest ажиллуулах” товчийг дарна уу. Хэдэн секунд болно.", "Press “Run backtest”. It takes a few seconds.")}</div>}

      {r && s && (
        <>
          <div className={`card border ${VERDICT[r.verdict].cls}`}>
            <div className="text-lg font-semibold">{t("Дүгнэлт:", "Verdict:")} {VERDICT[r.verdict].title}</div>
            <p className="mt-1 text-sm text-zinc-300">{VERDICT[r.verdict].body}</p>
          </div>

          {r.from === null ? (
            <div className="card text-zinc-400">{t("Шалгах хангалттай түүхэн дата алга. Эхлээд", "Not enough historical data to test. Run")} <code>npm run backfill</code> {t("ажиллуулна уу.", "first.")}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {([
                  [t("Хугацаа", "Period"), `${ubDateKey(r.from)} → ${r.to ? ubDateKey(r.to) : "—"}`],
                  [t("Арилжаа / дохио", "Trades / signals"), `${s.count} / ${r.signalCount}`],
                  ["Win rate", s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%`],
                  ["Profit factor", s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)],
                  [t("Нийт P&L", "Total P&L"), `${usd(s.totalPnl)} (${r.returnPct.toFixed(2)}%)`, pnlClass(s.totalPnl)],
                  [t("Дундаж R", "Average R"), s.avgR === null ? "—" : `${s.avgR.toFixed(2)}R`],
                  [t("Хамгийн их уналт", "Max drawdown"), `${r.maxDrawdownPct.toFixed(2)}%`, r.maxDrawdownPct >= params.maxDrawdownPct ? "text-red-400" : undefined],
                  ["Kill switch", r.killSwitchAt ? t(`${ubDateKey(r.killSwitchAt)}-нд асах байсан`, `would have tripped on ${ubDateKey(r.killSwitchAt)}`) : t("асаагүй", "not tripped"), r.killSwitchAt ? "text-red-400" : undefined],
                ] as [string, string, string?][]).map(([k, v, c]) => (
                  <div key={k} className="card"><div className="text-xs text-zinc-400">{k}</div><div className={`mt-1 font-mono font-semibold ${c ?? ""}`}>{v}</div></div>
                ))}
              </div>

              {s.count > 0 && (
                <>
                  <div className="card"><h2 className="card-title">{t("Дансны муруй (P&L)", "Account curve (P&L)")}</h2><EquityCurve points={s.equity} v={v} /></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="card">
                      <h2 className="card-title">{t("Сараар", "By month")}</h2>
                      <table className="w-full">
                        <thead><tr><th className="th">{t("Сар", "Month")}</th><th className="th">{t("Арилжаа", "Trades")}</th><th className="th">P&L</th></tr></thead>
                        <tbody>{r.months.map((m) => <tr key={m.month} className="border-t border-zinc-800"><td className="td font-mono">{m.month}</td><td className="td font-mono">{m.trades}</td><td className={`td font-mono ${pnlClass(m.pnl)}`}>{usd(m.pnl)}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="card">
                      <h2 className="card-title">{t("Хэрхэн хаагдсан", "How they closed")}</h2>
                      <table className="w-full">
                        <tbody>{(Object.keys(REASON) as ExitReason[]).map((k) => <tr key={k} className="border-t border-zinc-800 first:border-t-0"><td className="td">{REASON[k]}</td><td className="td font-mono">{r.byReason[k]}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                  <div className="card overflow-x-auto p-0">
                    <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400">{t("Сүүлийн 50 арилжаа", "Last 50 trades")}</h2>
                    <table className="w-full">
                      <thead><tr>{[t("Нээсэн (УБ)", "Opened (UB)"), t("Чиглэл", "Side"), t("Лот", "Lots"), t("Орсон", "Entry"), "Stop", t("Гарсан", "Exit"), t("Шалтгаан", "Reason"), "P&L", "R"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                      <tbody>
                        {r.trades.slice(-50).reverse().map((tr, i) => (
                          <tr key={i} className="border-t border-zinc-800">
                            <td className="td whitespace-nowrap font-mono">{formatUbDateTime(tr.openedAt)}</td>
                            <td className={`td ${tr.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{tr.direction === "BUY" ? "Buy" : "Sell"}</td>
                            <td className="td font-mono">{tr.lots.toFixed(2)}</td>
                            <td className="td font-mono">{tr.entryPrice.toFixed(2)}</td>
                            <td className="td font-mono">{tr.stopLoss.toFixed(2)}</td>
                            <td className="td font-mono">{tr.exitPrice.toFixed(2)}</td>
                            <td className="td">{REASON[tr.reason]}</td>
                            <td className={`td font-mono ${pnlClass(tr.pnl)}`}>{usd(tr.pnl)}</td>
                            <td className="td font-mono">{tr.r.toFixed(2)}R</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          <div className="card text-xs text-zinc-500">
            <p className="mb-1 font-medium text-zinc-400">{t("Энэ шалгалтын хязгаар", "Limits of this test")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Шийдвэр гаргах мөчид зөвхөн бүрэн хаагдсан лааг ашигласан; нэг лаанд stop, target хоёулаа хүрвэл stop гэж тооцсон.", "Decisions used only fully closed candles; when one candle reached both stop and target, it was counted as the stop.")}</li>
              <li>{t("Spread-ийг орох үнэд нэмсэн. Slippage, swap, брокерын шимтгэл тооцоогүй тул бодит үр дүн үүнээс муу байх магадлалтай.", "The spread was added to the entry price. Slippage, swap and broker commission are not included, so real results are likely to be worse.")}</li>
              <li>{t("Баазад байхгүй өнгөрсөн мэдээ (жишээ нь өмнөх FOMC) шүүгдээгүй.", "Past releases that are not in the database (for example earlier FOMC meetings) were not filtered.")}</li>
              <li>{t("Өнгөрсөн үр дүн ирээдүйн ашгийг батлахгүй. Санхүүгийн зөвлөгөө биш.", "Past results do not guarantee future profit. Not financial advice.")}</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
