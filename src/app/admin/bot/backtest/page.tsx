import { requireAdmin } from "@/lib/auth";
import { runBacktestFromDb, paramsFromQuery } from "@/lib/bot/run";
import { EquityCurve } from "@/components/EquityCurve";
import { Figures, Pnl, SidePill, Station, BackLink, signedUsd, toneOf, Dir } from "@/components/Timetable";
import { formatUbDateTime, ubDateKey } from "@/lib/time";
import type { Verdict, ExitReason } from "@/lib/bot/backtest";
import { getViewer } from "@/lib/prefs.server";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Tone = "on" | "off" | "warn" | "down";
const VERDICT_TEXT: Record<Tone, string> = { on: "text-emerald-400", off: "text-zinc-100", warn: "text-amber-300", down: "text-red-400" };

const verdictOf = (t: T): Record<Verdict, { title: string; body: string; cls: Tone }> => ({
  INSUFFICIENT: { title: t("Дүгнэхэд эрт", "Too early to judge"), body: t("Арилжааны тоо 30-аас цөөн тул статистик найдваргүй. Илүү урт түүх татах эсвэл шүүлтүүрийг сулруулж үзнэ.", "Fewer than 30 trades, so the statistics are unreliable. Load a longer history or loosen the filters."), cls: "off" },
  LOSING: { title: t("Алдагдалтай", "Losing"), body: t("Энэ тохиргоо өнгөрсөн хугацаанд мөнгө алдсан. Ийм дүрмээр bot ажиллуулж болохгүй.", "This configuration lost money in the past. Do not run a bot on these rules."), cls: "down" },
  MARGINAL: { title: t("Зааг дээр", "Borderline"), body: t("Ашиг бага эсвэл уналт их. Бодит зардал (slippage, swap) нэмэгдэхэд алдагдал руу орж магадгүй.", "Small profit or deep drawdown. Once real costs (slippage, swap) are added it may turn into a loss."), cls: "warn" },
  PROMISING: { title: t("Боломжийн", "Reasonable"), body: t("Өнгөрсөн дата дээр ашигтай гарсан. Энэ бол баталгаа биш: demo данс дээр бодит цагт шалгах дараагийн алхмын үндэслэл л юм.", "Profitable on past data. That is not a guarantee: it only justifies the next step, checking it in real time on a demo account."), cls: "on" },
});
const reasonOf = (t: T): Record<ExitReason, string> => ({ TP: "Target", SL: "Stop", BE: t("Тэг (breakeven)", "Breakeven"), TIME: t("Хугацаа дууссан", "Time expired"), WEEKEND: t("Амралтын өмнө", "Before the weekend"), END: t("Түүхийн төгсгөл", "End of history") });

const fieldsOf = (t: T): [string, string, string][] => ([
  ["minBias", t("Хамгийн бага оноо", "Minimum score"), "1"], ["atrMult", "Stop = ATR ×", "0.1"], ["rr", "Target = stop ×", "0.1"], ["riskPct", t("Эрсдэл, %", "Risk, %"), "0.05"],
  ["maxTradesPerDay", t("Өдөрт арилжаа", "Trades per day"), "1"], ["dailyLossPct", t("Өдрийн алдагдлын хязгаар, %", "Daily loss limit, %"), "0.1"], ["maxDrawdownPct", "Kill switch, %", "0.5"],
  ["sessionStartUb", t("Эхлэх цаг (УБ)", "Start hour (UB)"), "1"], ["sessionEndUb", t("Дуусах цаг (УБ)", "End hour (UB)"), "1"], ["newsBeforeMin", t("Мэдээний өмнө, мин", "Before news, min"), "5"],
  ["newsAfterMin", t("Мэдээний дараа, мин", "After news, min"), "5"], ["spread", "Spread, $", "0.05"], ["startBalance", t("Эхлэх данс, $", "Starting balance, $"), "100"],
]);

export default async function BotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin(); // the layout's check does not guard this page: layouts do not re-run on navigation
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
    <div className="space-y-4 sm:space-y-5">
      <div>
        <BackLink href="/admin/bot">{t("Bot", "Bot")}</BackLink>
        <h1 className="page-title">{t("Bot — backtest", "Bot — backtest")}</h1>
        <p className="page-lede">{t("Арилжааны дүрмийг баазад байгаа түүхэн дата дээр ажиллуулж шалгана. Жинхэнэ болон demo захиалга өгөхгүй.", "Runs the trading rules over the historical data in the database. No live or demo orders are placed.")} <a href="/admin/bot/paper" className="font-medium whitespace-nowrap text-zinc-100 underline decoration-amber-400 decoration-2">{t("Цаасан арилжаа →", "Paper trading →")}</a></p>
      </div>

      <form className="card space-y-4">
        <input type="hidden" name="run" value="1" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FIELDS.map(([name, label, step]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input className="input tabular-nums" id={name} name={name} type="number" step={step} defaultValue={Number(values[name])} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-zinc-800 pt-3 text-sm text-zinc-200">
          <label className="flex min-h-11 items-center gap-3"><input type="hidden" name="breakeven" value="0" /><input type="checkbox" name="breakeven" value="1" defaultChecked={params.breakeven} className="h-5 w-5 accent-amber-500" /> {t("+1R-д stop-ыг орсон үнэ рүү зөөх", "Move the stop to entry at +1R")}</label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="requireH1Agree" value="1" defaultChecked={params.requireH1Agree} className="h-5 w-5 accent-amber-500" /> {t("1 цагийн чарт мөн тохирсон байх", "The 1-hour chart must agree too")}</label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn">{t("Backtest ажиллуулах", "Run backtest")}</button>
          <a href="/admin/bot/backtest" className="btn-ghost">{t("Анхны тохиргоо", "Default settings")}</a>
          <span className="text-xs leading-relaxed text-amber-300">{t("Тохиргоог олон дахин өөрчилж хамгийн сайн тоог хайх нь өнгөрсөн датад тааруулах эрсдэлтэй.", "Changing the settings again and again to find the best number risks fitting them to the past.")}</span>
        </div>
      </form>

      {!r && <div className="card text-sm text-zinc-400">{t("“Backtest ажиллуулах” товчийг дарна уу. Хэдэн секунд болно.", "Press “Run backtest”. It takes a few seconds.")}</div>}

      {r && s && (
        <>
          <section className="card" aria-label={t("Дүгнэлт", "Verdict")}>
            <div className={`flex items-center gap-2.5 text-lg font-bold ${VERDICT_TEXT[VERDICT[r.verdict].cls]}`}><Station tone={VERDICT[r.verdict].cls} />{t("Дүгнэлт:", "Verdict:")} {VERDICT[r.verdict].title}</div>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-300">{VERDICT[r.verdict].body}</p>
          </section>

          {r.from === null ? (
            <div className="card text-sm text-zinc-400">{t("Шалгах хангалттай түүхэн дата алга. Эхлээд", "Not enough historical data to test. Run")} <code>npm run backfill</code> {t("ажиллуулна уу.", "first.")}</div>
          ) : (
            <>
              <Figures className="grid-cols-2 md:grid-cols-4" items={[
                { label: t("Хугацаа", "Period"), value: `${ubDateKey(r.from)} → ${r.to ? ubDateKey(r.to) : "—"}`, tone: "text-sm text-zinc-100 sm:text-base" },
                { label: t("Арилжаа / дохио", "Trades / signals"), value: `${s.count} / ${r.signalCount}` },
                { label: "Win rate", value: s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%` },
                { label: "Profit factor", value: s.profitFactor === null ? "—" : s.profitFactor.toFixed(2) },
                { label: t("Нийт P&L", "Total P&L"), value: <>{s.totalPnl !== 0 && <><Dir d={s.totalPnl} />{" "}</>}{signedUsd(s.totalPnl)}</>, tone: toneOf(s.totalPnl), note: `${r.returnPct > 0 ? "+" : r.returnPct < 0 ? "−" : ""}${Math.abs(r.returnPct).toFixed(2)}%` },
                { label: t("Дундаж R", "Average R"), value: s.avgR === null ? "—" : `${s.avgR > 0 ? "+" : s.avgR < 0 ? "−" : ""}${Math.abs(s.avgR).toFixed(2)}R`, tone: s.avgR === null ? undefined : toneOf(s.avgR) },
                { label: t("Хамгийн их уналт", "Max drawdown"), value: <>{r.maxDrawdownPct > 0 && <><Dir d={-1} />{" "}</>}{r.maxDrawdownPct.toFixed(2)}%</>, tone: r.maxDrawdownPct >= params.maxDrawdownPct ? "text-red-400" : undefined },
                { label: "Kill switch", value: r.killSwitchAt ? t(`${ubDateKey(r.killSwitchAt)}-нд асах байсан`, `would have tripped on ${ubDateKey(r.killSwitchAt)}`) : t("асаагүй", "not tripped"), tone: r.killSwitchAt ? "text-sm text-red-400 sm:text-base" : "text-sm text-zinc-100 sm:text-base" },
              ]} />

              {s.count > 0 && (
                <>
                  <section className="card" aria-labelledby="curve-h"><h2 id="curve-h" className="mb-3 text-[15px] font-semibold text-zinc-100">{t("Дансны муруй (P&L)", "Account curve (P&L)")}</h2><EquityCurve points={s.equity} v={v} /></section>
                  <div className="grid items-start gap-4 sm:gap-5 md:grid-cols-2">
                    <section className="table-card" aria-labelledby="month-h">
                      <h2 id="month-h" className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{t("Сараар", "By month")}</h2>
                      <table className="w-full border-collapse">
                        <thead><tr className="border-b border-zinc-800"><th className="th">{t("Сар", "Month")}</th><th className="th text-right">{t("Арилжаа", "Trades")}</th><th className="th text-right">P&L</th></tr></thead>
                        <tbody>{r.months.map((m) => <tr key={m.month} className="border-t border-zinc-800/70 first:border-t-0"><td className="td font-semibold text-zinc-100 tabular-nums">{m.month}</td><td className="td text-right text-zinc-400 tabular-nums">{m.trades}</td><td className="td text-right"><Pnl value={m.pnl} /></td></tr>)}</tbody>
                      </table>
                    </section>
                    <section className="table-card" aria-labelledby="reason-h">
                      <h2 id="reason-h" className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{t("Хэрхэн хаагдсан", "How they closed")}</h2>
                      <table className="w-full border-collapse">
                        <tbody>{(Object.keys(REASON) as ExitReason[]).map((k) => <tr key={k} className="border-t border-zinc-800/70"><td className="td text-zinc-300">{REASON[k]}</td><td className="td text-right font-semibold text-zinc-100 tabular-nums">{r.byReason[k]}</td></tr>)}</tbody>
                      </table>
                    </section>
                  </div>
                  <section className="table-card" aria-labelledby="last-h">
                    <h2 id="last-h" className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{t("Сүүлийн 50 арилжаа", "Last 50 trades")}</h2>
                    <table className="w-full border-collapse">
                      <thead><tr className="border-b border-zinc-800">{[[t("Нээсэн (УБ)", "Opened (UB)"), ""], [t("Чиглэл", "Side"), ""], [t("Lot", "Lots"), "text-right"], [t("Орсон", "Entry"), "text-right"], ["Stop", "text-right"], [t("Гарсан", "Exit"), "text-right"], [t("Шалтгаан", "Reason"), ""], ["P&L", "text-right"], ["R", "text-right"]].map(([h, cls]) => <th key={h} className={`th ${cls}`}>{h}</th>)}</tr></thead>
                      <tbody>
                        {r.trades.slice(-50).reverse().map((tr, i) => (
                          <tr key={i} className="border-t border-zinc-800/70 first:border-t-0">
                            <td className="td font-semibold whitespace-nowrap text-zinc-50 tabular-nums">{formatUbDateTime(tr.openedAt)}</td>
                            <td className="td"><SidePill side={tr.direction} /></td>
                            <td className="td text-right tabular-nums">{tr.lots.toFixed(2)}</td>
                            <td className="td text-right tabular-nums">{tr.entryPrice.toFixed(2)}</td>
                            <td className="td text-right text-zinc-400 tabular-nums">{tr.stopLoss.toFixed(2)}</td>
                            <td className="td text-right tabular-nums">{tr.exitPrice.toFixed(2)}</td>
                            <td className="td whitespace-nowrap text-zinc-400">{REASON[tr.reason]}</td>
                            <td className="td text-right"><Pnl value={tr.pnl} /></td>
                            <td className={`td text-right tabular-nums ${toneOf(tr.r)}`}>{tr.r > 0 ? "+" : tr.r < 0 ? "−" : ""}{Math.abs(tr.r).toFixed(2)}R</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </>
              )}
            </>
          )}

          <section className="rounded-xl bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-200 sm:px-5" aria-labelledby="limits-h">
            <p id="limits-h" className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-amber-300"><Station tone="warn" />{t("Энэ шалгалтын хязгаар", "Limits of this test")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Шийдвэр гаргах мөчид зөвхөн бүрэн хаагдсан лааг ашигласан; нэг лаанд stop, target хоёулаа хүрвэл stop гэж тооцсон.", "Decisions used only fully closed candles; when one candle reached both stop and target, it was counted as the stop.")}</li>
              <li>{t("Spread-ийг орох үнэд нэмсэн. Slippage, swap, broker-ын шимтгэл тооцоогүй тул бодит үр дүн үүнээс муу байх магадлалтай.", "The spread was added to the entry price. Slippage, swap and broker commission are not included, so real results are likely to be worse.")}</li>
              <li>{t("Баазад байхгүй өнгөрсөн мэдээ (жишээ нь өмнөх FOMC) шүүгдээгүй.", "Past releases that are not in the database (for example earlier FOMC meetings) were not filtered.")}</li>
              <li>{t("Өнгөрсөн үр дүн ирээдүйн ашгийг батлахгүй. Санхүүгийн зөвлөгөө биш.", "Past results do not guarantee future profit. Not financial advice.")}</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
