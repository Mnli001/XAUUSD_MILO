import Link from "next/link";
import { getPaperReport } from "@/lib/bot/paperDb";
import { PAPER_MIN_TRADES, type PaperVerdict, type TodayStatus } from "@/lib/bot/paper";
import { MIN_TEST_AVG_R, MIN_TEST_PROFIT_FACTOR } from "@/lib/bot/variants";
import { startPaperAction } from "@/lib/actions/admin";
import { EquityCurve } from "@/components/EquityCurve";
import { usd, pnlClass } from "@/lib/format";
import { formatUbDateTime } from "@/lib/time";
import type { ExitReason } from "@/lib/bot/backtest";
import { getViewer } from "@/lib/prefs.server";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const verdictOf = (t: T): Record<PaperVerdict, { title: string; body: string; cls: string }> => ({
  PENDING: { title: t("Шалгалт үргэлжилж байна", "Test in progress"), body: t(`Дүгнэлт ${PAPER_MIN_TRADES} арилжаа хуримтлагдсаны дараа гарна. Түүнээс өмнөх тоонд итгэж болохгүй.`, `The verdict comes after ${PAPER_MIN_TRADES} trades have accumulated. Numbers before that cannot be trusted.`), cls: "border-zinc-600 text-zinc-200" },
  PASSED: { title: t("Тэнцсэн", "Passed"), body: t("Урьдчилан тогтоосон шалгуурыг шинэ дата дээр давлаа. Дараагийн алхам нь MT5 demo данс. Энэ нь ашгийн баталгаа биш.", "It cleared the criteria set in advance on new data. The next step is an MT5 demo account. This is not a guarantee of profit."), cls: "border-emerald-500/60 text-emerald-300" },
  FAILED: { title: t("Тэнцээгүй", "Failed"), body: t("Шинэ дата дээр шалгуурт хүрсэнгүй. Энэ дүрмээр бот хийх үндэслэл алга.", "It did not meet the criteria on new data. There is no basis for building a bot on this rule."), cls: "border-red-500/60 text-red-300" },
});
const phaseOf = (t: T): Record<TodayStatus["phase"], string> => ({
  NO_DATA: t("Үнийн дата алга — cron ажиллаж байгаа эсэхийг шалгана уу", "No price data — check that cron is running"),
  RANGE: t("Азийн сессийн хүрээг тэмдэглэж байна (УБ 15:00 хүртэл)", "Marking the Asian session range (until 15:00 UB)"),
  WATCHING: t("Хүрээнээс гарах хөдөлгөөнийг хүлээж байна (УБ 15:00–00:00)", "Waiting for a move out of the range (15:00–00:00 UB)"),
  DONE: t("Өнөөдрийн дохио гарсан", "Today's signal has fired"),
  CLOSED: t("Өнөөдөр шинэ арилжаа нээхгүй", "No new trade today"),
});
const reasonOf = (t: T): Record<ExitReason, string> => ({ TP: "Target", SL: "Stop", BE: t("Тэг", "Breakeven"), TIME: t("Хугацаа дууссан", "Time expired"), WEEKEND: t("Амралтын өмнө", "Before the weekend"), END: t("Нээлттэй", "Open") });
const price = (v: number) => v.toFixed(2);

export default async function PaperPage() {
  const v = await getViewer();
  const { t } = v;
  const VERDICT = verdictOf(t), PHASE = phaseOf(t), REASON = reasonOf(t);
  const now = new Date();
  const r = await getPaperReport(now);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/bot" className="text-sm text-zinc-400 hover:text-zinc-50">{t("← Бот", "← Bot")}</Link>
        <h1 className="mt-1 text-xl font-semibold">{t("Бот — цаасан арилжаа", "Bot — paper trading")}</h1>
        <p className="text-sm text-zinc-400">{t("“Азийн хүрээний breakout + өдрийн тренд” дүрмийг шинэ дата дээр бодит цагт шалгана. Мөнгө оролцохгүй, захиалга хаашаа ч илгээгдэхгүй.", "Tests the “Asian range breakout + daily trend” rule on new data in real time. No money is involved and no order is sent anywhere.")}</p>
      </div>

      {!r ? (
        <form action={startPaperAction} className="card space-y-3">
          <p className="text-zinc-300">{t("Шалгалт эхлээгүй байна. Эхлүүлсэн мөчөөс хойших дохионууд л тооцогдоно.", "The test has not started. Only signals after the moment it starts are counted.")}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
            <li>{t("Эхлэх цагийг дараа нь өөрчлөх боломжгүй. Ингэснээр тохиромжтой үеийг сонгож эхлүүлэх боломжгүй болно.", "The start time cannot be changed later, so a convenient period cannot be picked after the fact.")}</li>
            <li>{t("Шалгуур:", "Criteria:")} {PAPER_MIN_TRADES}{t("-өөс дээш арилжаа, дундаж R ≥", " or more trades, average R ≥")} {MIN_TEST_AVG_R}, profit factor ≥ {MIN_TEST_PROFIT_FACTOR}.</li>
            <li>{t("Өдөрт ихдээ 1 арилжаа тул 3 орчим сар үргэлжилнэ. Үнийн дата тасралтгүй шинэчлэгдэж байх ёстой.", "At most 1 trade a day, so it runs for about 3 months. Price data must keep updating without gaps.")}</li>
          </ul>
          <button className="btn">{t("Шалгалтыг эхлүүлэх", "Start the test")}</button>
        </form>
      ) : (
        <>
          <div className={`card border ${VERDICT[r.verdict].cls}`}>
            <div className="text-lg font-semibold">{VERDICT[r.verdict].title}</div>
            <p className="mt-1 text-sm text-zinc-300">{VERDICT[r.verdict].body}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={PAPER_MIN_TRADES} aria-valuenow={Math.min(r.stats.n, PAPER_MIN_TRADES)}>
              <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (r.stats.n / PAPER_MIN_TRADES) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-zinc-400">{r.stats.n} / {PAPER_MIN_TRADES} {t("арилжаа · эхэлсэн", "trades · started")} {formatUbDateTime(r.startedAt)} ({t("УБ", "UB")})</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {([
              [t("Цаасан данс", "Paper account"), usd(r.balance), pnlClass(r.balance - r.startBalance)],
              [t("Дундаж R", "Average R"), r.stats.avgR === null ? "—" : `${r.stats.avgR.toFixed(2)}R`],
              ["Profit factor", r.stats.profitFactor === null ? "—" : r.stats.profitFactor.toFixed(2)],
              ["Win rate", r.stats.winRate === null ? "—" : `${r.stats.winRate.toFixed(0)}%`],
            ] as [string, string, string?][]).map(([k, v, c]) => (
              <div key={k} className="card"><div className="text-xs text-zinc-400">{k}</div><div className={`mt-1 font-mono font-semibold ${c ?? ""}`}>{v}</div></div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card space-y-1 text-sm">
              <h2 className="mb-1 text-sm font-medium text-zinc-400">{t("Өнөөдөр", "Today")}</h2>
              <p>{PHASE[r.today.phase]}</p>
              <p className="text-zinc-400">{t("Азийн хүрээ:", "Asian range:")} {r.today.rangeLow === null || r.today.rangeHigh === null ? "—" : `${price(r.today.rangeLow)} – ${price(r.today.rangeHigh)}`}</p>
              <p className="text-zinc-400">{t("Өдрийн тренд:", "Daily trend:")} {r.today.trend === "UP" ? t("өсөх (зөвхөн дээш гарвал орно)", "up (enters only on a break upward)") : r.today.trend === "DOWN" ? t("унах (зөвхөн доош гарвал орно)", "down (enters only on a break downward)") : t("тодорхойгүй (арилжаа хийхгүй)", "unclear (no trading)")}</p>
              <p className="text-xs text-zinc-500">{t("Сүүлийн хаагдсан лаа:", "Last closed candle:")} {r.lastBarAt ? `${formatUbDateTime(r.lastBarAt)} (${t("УБ", "UB")})` : "—"}</p>
            </div>
            <div className="card space-y-1 text-sm">
              <h2 className="mb-1 text-sm font-medium text-zinc-400">{t("Нээлттэй арилжаа", "Open trade")}</h2>
              {r.open ? (
                <>
                  <p><span className={r.open.direction === "BUY" ? "text-emerald-400" : "text-red-400"}>{r.open.direction === "BUY" ? "Buy" : "Sell"}</span> {r.open.lots.toFixed(2)} {t("лот · орсон", "lots · entry")} {price(r.open.entryPrice)} · stop {price(r.open.stopLoss)}</p>
                  <p className="text-zinc-400">{t("Нээсэн", "Opened")} {formatUbDateTime(r.open.openedAt)} {t("(УБ) · одоогийн үр дүн", "(UB) · current result")} <span className={pnlClass(r.open.pnl)}>{usd(r.open.pnl)}</span></p>
                </>
              ) : <p className="text-zinc-500">{t("Алга", "None")}</p>}
            </div>
          </div>

          {r.closed.length > 0 && (
            <>
              <div className="card"><h2 className="card-title">{t("Цаасан дансны муруй", "Paper account curve")}</h2><EquityCurve points={r.closed.reduce<{ value: number }[]>((a, tr) => [...a, { value: (a.at(-1)?.value ?? 0) + tr.pnl }], [])} v={v} /></div>
              <div className="card overflow-x-auto p-0">
                <table className="w-full">
                  <thead><tr>{[t("Нээсэн (УБ)", "Opened (UB)"), t("Чиглэл", "Side"), t("Лот", "Lots"), t("Орсон", "Entry"), "Stop", t("Гарсан", "Exit"), t("Шалтгаан", "Reason"), "P&L", "R"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody>
                    {[...r.closed].reverse().map((tr, i) => (
                      <tr key={i} className="border-t border-zinc-800">
                        <td className="td whitespace-nowrap font-mono">{formatUbDateTime(tr.openedAt)}</td>
                        <td className={`td ${tr.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{tr.direction === "BUY" ? "Buy" : "Sell"}</td>
                        <td className="td font-mono">{tr.lots.toFixed(2)}</td>
                        <td className="td font-mono">{price(tr.entryPrice)}</td>
                        <td className="td font-mono">{price(tr.stopLoss)}</td>
                        <td className="td font-mono">{price(tr.exitPrice)}</td>
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

          <p className="text-xs text-zinc-500">{t("Арилжаанууд хадгалагдсан лаанаас дахин тооцогддог тул үнийн дата тасарсан өдрүүдэд дохио алдагдаж болно. Spread $0.30 тооцсон; slippage, swap тооцоогүй. Санхүүгийн зөвлөгөө биш.", "Trades are recomputed from stored candles, so signals can be missed on days when price data was interrupted. A $0.30 spread is included; slippage and swap are not. Not financial advice.")}</p>
        </>
      )}
    </div>
  );
}
