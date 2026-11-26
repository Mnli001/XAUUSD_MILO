import { requireAdmin } from "@/lib/auth";
import { getPaperReport } from "@/lib/bot/paperDb";
import { PAPER_MIN_TRADES, type PaperVerdict, type TodayStatus } from "@/lib/bot/paper";
import { MIN_TEST_AVG_R, MIN_TEST_PROFIT_FACTOR } from "@/lib/bot/variants";
import { startPaperAction } from "@/lib/actions/admin";
import { EquityCurve } from "@/components/EquityCurve";
import { usd } from "@/lib/format";
import { Figures, Pnl, SidePill, Station, BackLink, signedUsd, toneOf, Dir } from "@/components/Timetable";
import { formatUbDateTime } from "@/lib/time";
import type { ExitReason } from "@/lib/bot/backtest";
import { getViewer } from "@/lib/prefs.server";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Tone = "on" | "off" | "down";
const VERDICT_TEXT: Record<Tone, string> = { on: "text-emerald-400", off: "text-zinc-100", down: "text-red-400" };

const verdictOf = (t: T): Record<PaperVerdict, { title: string; body: string; cls: Tone }> => ({
  PENDING: { title: t("Шалгалт үргэлжилж байна", "Test in progress"), body: t(`Дүгнэлт ${PAPER_MIN_TRADES} арилжаа хуримтлагдсаны дараа гарна. Түүнээс өмнөх тоонд итгэж болохгүй.`, `The verdict comes after ${PAPER_MIN_TRADES} trades have accumulated. Numbers before that cannot be trusted.`), cls: "off" },
  PASSED: { title: t("Тэнцсэн", "Passed"), body: t("Урьдчилан тогтоосон шалгуурыг шинэ дата дээр давлаа. Дараагийн алхам нь MT5 demo данс. Энэ нь ашгийн баталгаа биш.", "It cleared the criteria set in advance on new data. The next step is an MT5 demo account. This is not a guarantee of profit."), cls: "on" },
  FAILED: { title: t("Тэнцээгүй", "Failed"), body: t("Шинэ дата дээр шалгуурт хүрсэнгүй. Энэ дүрмээр бот хийх үндэслэл алга.", "It did not meet the criteria on new data. There is no basis for building a bot on this rule."), cls: "down" },
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
  await requireAdmin(); // the layout's check does not guard this page: layouts do not re-run on navigation
  const v = await getViewer();
  const { t } = v;
  const VERDICT = verdictOf(t), PHASE = phaseOf(t), REASON = reasonOf(t);
  const now = new Date();
  const r = await getPaperReport(now);
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <BackLink href="/admin/bot">{t("Бот", "Bot")}</BackLink>
        <h1 className="page-title">{t("Бот — цаасан арилжаа", "Bot — paper trading")}</h1>
        <p className="page-lede">{t("“Азийн хүрээний breakout + өдрийн тренд” дүрмийг шинэ дата дээр бодит цагт шалгана. Мөнгө оролцохгүй, захиалга хаашаа ч илгээгдэхгүй.", "Tests the “Asian range breakout + daily trend” rule on new data in real time. No money is involved and no order is sent anywhere.")}</p>
      </div>

      {!r ? (
        <form action={startPaperAction} className="card max-w-2xl space-y-3">
          <p className="text-zinc-100">{t("Шалгалт эхлээгүй байна. Эхлүүлсэн мөчөөс хойших дохионууд л тооцогдоно.", "The test has not started. Only signals after the moment it starts are counted.")}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-400">
            <li>{t("Эхлэх цагийг дараа нь өөрчлөх боломжгүй. Ингэснээр тохиромжтой үеийг сонгож эхлүүлэх боломжгүй болно.", "The start time cannot be changed later, so a convenient period cannot be picked after the fact.")}</li>
            <li>{t("Шалгуур:", "Criteria:")} {PAPER_MIN_TRADES}{t("-өөс дээш арилжаа, дундаж R ≥", " or more trades, average R ≥")} {MIN_TEST_AVG_R}, profit factor ≥ {MIN_TEST_PROFIT_FACTOR}.</li>
            <li>{t("Өдөрт ихдээ 1 арилжаа тул 3 орчим сар үргэлжилнэ. Үнийн дата тасралтгүй шинэчлэгдэж байх ёстой.", "At most 1 trade a day, so it runs for about 3 months. Price data must keep updating without gaps.")}</li>
          </ul>
          <button className="btn">{t("Шалгалтыг эхлүүлэх", "Start the test")}</button>
        </form>
      ) : (
        <>
          <section className="card" aria-label={VERDICT[r.verdict].title}>
            <div className={`flex items-center gap-2.5 text-lg font-bold ${VERDICT_TEXT[VERDICT[r.verdict].cls]}`}><Station tone={VERDICT[r.verdict].cls} />{VERDICT[r.verdict].title}</div>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-300">{VERDICT[r.verdict].body}</p>
            {/* Progress toward the verdict as a line filling toward its last station. */}
            <div className="mt-4 flex items-center gap-2">
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={PAPER_MIN_TRADES} aria-valuenow={Math.min(r.stats.n, PAPER_MIN_TRADES)}>
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (r.stats.n / PAPER_MIN_TRADES) * 100)}%` }} />
              </div>
              <Station tone={r.stats.n >= PAPER_MIN_TRADES ? "now" : "off"} />
            </div>
            <p className="mt-1.5 text-xs text-zinc-400"><span className="font-semibold text-zinc-100 tabular-nums">{r.stats.n} / {PAPER_MIN_TRADES}</span> {t("арилжаа · эхэлсэн", "trades · started")} <span className="tabular-nums">{formatUbDateTime(r.startedAt)}</span> ({t("УБ", "UB")})</p>
          </section>

          <Figures className="grid-cols-2 md:grid-cols-4" items={[
            { label: t("Цаасан данс", "Paper account"), value: usd(r.balance), tone: toneOf(r.balance - r.startBalance), note: <span className={toneOf(r.balance - r.startBalance)}>{signedUsd(r.balance - r.startBalance)}</span> },
            { label: t("Дундаж R", "Average R"), value: r.stats.avgR === null ? "—" : `${r.stats.avgR > 0 ? "+" : r.stats.avgR < 0 ? "−" : ""}${Math.abs(r.stats.avgR).toFixed(2)}R`, tone: r.stats.avgR === null ? undefined : toneOf(r.stats.avgR) },
            { label: "Profit factor", value: r.stats.profitFactor === null ? "—" : r.stats.profitFactor.toFixed(2) },
            { label: "Win rate", value: r.stats.winRate === null ? "—" : `${r.stats.winRate.toFixed(0)}%` },
          ]} />

          <div className="grid items-start gap-4 sm:gap-5 md:grid-cols-2">
            <section className="card space-y-1.5 text-sm" aria-labelledby="today-h">
              <h2 id="today-h" className="card-title">{t("Өнөөдөр", "Today")}</h2>
              <p className="flex items-start gap-2.5 font-medium text-zinc-100"><Station tone={r.today.phase === "WATCHING" || r.today.phase === "DONE" ? "now" : r.today.phase === "NO_DATA" ? "warn" : "off"} className="mt-0.5" />{PHASE[r.today.phase]}</p>
              <p className="text-zinc-400">{t("Азийн хүрээ:", "Asian range:")} <span className="text-zinc-100 tabular-nums">{r.today.rangeLow === null || r.today.rangeHigh === null ? "—" : `${price(r.today.rangeLow)} – ${price(r.today.rangeHigh)}`}</span></p>
              <p className="text-zinc-400">{t("Өдрийн тренд:", "Daily trend:")} <span className={r.today.trend === "UP" ? "text-emerald-400" : r.today.trend === "DOWN" ? "text-red-400" : "text-zinc-200"}>{r.today.trend === "UP" ? <><Dir d={1} />{" "}</> : r.today.trend === "DOWN" ? <><Dir d={-1} />{" "}</> : null}{r.today.trend === "UP" ? t("өсөх (зөвхөн дээш гарвал орно)", "up (enters only on a break upward)") : r.today.trend === "DOWN" ? t("унах (зөвхөн доош гарвал орно)", "down (enters only on a break downward)") : t("тодорхойгүй (арилжаа хийхгүй)", "unclear (no trading)")}</span></p>
              <p className="text-xs text-zinc-500">{t("Сүүлийн хаагдсан лаа:", "Last closed candle:")} <span className="tabular-nums">{r.lastBarAt ? `${formatUbDateTime(r.lastBarAt)} (${t("УБ", "UB")})` : "—"}</span></p>
            </section>
            <section className="card space-y-1.5 text-sm" aria-labelledby="open-h">
              <h2 id="open-h" className="card-title">{t("Нээлттэй арилжаа", "Open trade")}</h2>
              {r.open ? (
                <>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-200"><SidePill side={r.open.direction} label={r.open.direction === "BUY" ? "Buy" : "Sell"} /> <span className="tabular-nums">{r.open.lots.toFixed(2)} {t("лот · орсон", "lots · entry")} {price(r.open.entryPrice)} · stop {price(r.open.stopLoss)}</span></p>
                  <p className="text-zinc-400">{t("Нээсэн", "Opened")} <span className="tabular-nums">{formatUbDateTime(r.open.openedAt)}</span> {t("(УБ) · одоогийн үр дүн", "(UB) · current result")} <Pnl value={r.open.pnl} /></p>
                </>
              ) : <p className="text-zinc-500">{t("Алга", "None")}</p>}
            </section>
          </div>

          {r.closed.length > 0 && (
            <>
              <section className="card" aria-labelledby="curve-h"><h2 id="curve-h" className="mb-3 text-[15px] font-semibold text-zinc-100">{t("Цаасан дансны муруй", "Paper account curve")}</h2><EquityCurve points={r.closed.reduce<{ value: number }[]>((a, tr) => [...a, { value: (a.at(-1)?.value ?? 0) + tr.pnl }], [])} v={v} /></section>
              <div className="table-card">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-zinc-800">{[[t("Нээсэн (УБ)", "Opened (UB)"), ""], [t("Чиглэл", "Side"), ""], [t("Лот", "Lots"), "text-right"], [t("Орсон", "Entry"), "text-right"], ["Stop", "text-right"], [t("Гарсан", "Exit"), "text-right"], [t("Шалтгаан", "Reason"), ""], ["P&L", "text-right"], ["R", "text-right"]].map(([h, cls]) => <th key={h} className={`th ${cls}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...r.closed].reverse().map((tr, i) => (
                      <tr key={i} className="border-t border-zinc-800/70 first:border-t-0">
                        <td className="td font-semibold whitespace-nowrap text-zinc-50 tabular-nums">{formatUbDateTime(tr.openedAt)}</td>
                        <td className="td"><SidePill side={tr.direction} label={tr.direction === "BUY" ? "Buy" : "Sell"} /></td>
                        <td className="td text-right tabular-nums">{tr.lots.toFixed(2)}</td>
                        <td className="td text-right tabular-nums">{price(tr.entryPrice)}</td>
                        <td className="td text-right text-zinc-400 tabular-nums">{price(tr.stopLoss)}</td>
                        <td className="td text-right tabular-nums">{price(tr.exitPrice)}</td>
                        <td className="td whitespace-nowrap text-zinc-400">{REASON[tr.reason]}</td>
                        <td className="td text-right"><Pnl value={tr.pnl} /></td>
                        <td className={`td text-right tabular-nums ${toneOf(tr.r)}`}>{tr.r > 0 ? "+" : tr.r < 0 ? "−" : ""}{Math.abs(tr.r).toFixed(2)}R</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p role="note" className="flex max-w-3xl gap-3 rounded-xl bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-200 sm:px-5"><Station tone="warn" className="mt-0.5" /><span>{t("Арилжаанууд хадгалагдсан лаанаас дахин тооцогддог тул үнийн дата тасарсан өдрүүдэд дохио алдагдаж болно. Spread $0.30 тооцсон; slippage, swap тооцоогүй. Санхүүгийн зөвлөгөө биш.", "Trades are recomputed from stored candles, so signals can be missed on days when price data was interrupted. A $0.30 spread is included; slippage and swap are not. Not financial advice.")}</span></p>
        </>
      )}
    </div>
  );
}
