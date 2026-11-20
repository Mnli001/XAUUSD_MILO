import Link from "next/link";
import { getPaperReport } from "@/lib/bot/paperDb";
import { PAPER_MIN_TRADES, type PaperVerdict, type TodayStatus } from "@/lib/bot/paper";
import { MIN_TEST_AVG_R, MIN_TEST_PROFIT_FACTOR } from "@/lib/bot/variants";
import { startPaperAction } from "@/lib/actions/admin";
import { EquityCurve } from "@/components/EquityCurve";
import { usd, pnlClass } from "@/lib/format";
import { formatUbDateTime } from "@/lib/time";
import type { ExitReason } from "@/lib/bot/backtest";

export const dynamic = "force-dynamic";

const VERDICT: Record<PaperVerdict, { title: string; body: string; cls: string }> = {
  PENDING: { title: "Шалгалт үргэлжилж байна", body: `Дүгнэлт ${PAPER_MIN_TRADES} арилжаа хуримтлагдсаны дараа гарна. Түүнээс өмнөх тоонд итгэж болохгүй.`, cls: "border-zinc-600 text-zinc-200" },
  PASSED: { title: "Тэнцсэн", body: "Урьдчилан тогтоосон шалгуурыг шинэ дата дээр давлаа. Дараагийн алхам нь MT5 demo данс. Энэ нь ашгийн баталгаа биш.", cls: "border-emerald-500/60 text-emerald-300" },
  FAILED: { title: "Тэнцээгүй", body: "Шинэ дата дээр шалгуурт хүрсэнгүй. Энэ дүрмээр бот хийх үндэслэл алга.", cls: "border-red-500/60 text-red-300" },
};
const PHASE: Record<TodayStatus["phase"], string> = {
  NO_DATA: "Үнийн дата алга — cron ажиллаж байгаа эсэхийг шалгана уу",
  RANGE: "Азийн сессийн хүрээг тэмдэглэж байна (УБ 15:00 хүртэл)",
  WATCHING: "Хүрээнээс гарах хөдөлгөөнийг хүлээж байна (УБ 15:00–00:00)",
  DONE: "Өнөөдрийн дохио гарсан",
  CLOSED: "Өнөөдөр шинэ арилжаа нээхгүй",
};
const REASON: Record<ExitReason, string> = { TP: "Target", SL: "Stop", BE: "Тэг", TIME: "Хугацаа дууссан", WEEKEND: "Амралтын өмнө", END: "Нээлттэй" };
const price = (v: number) => v.toFixed(2);

export default async function PaperPage() {
  const now = new Date();
  const r = await getPaperReport(now);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/bot" className="text-sm text-zinc-400 hover:text-white">← Backtest</Link>
        <h1 className="mt-1 text-xl font-semibold">Бот — цаасан арилжаа</h1>
        <p className="text-sm text-zinc-400">“Азийн хүрээний breakout + өдрийн тренд” дүрмийг шинэ дата дээр бодит цагт шалгана. Мөнгө оролцохгүй, захиалга хаашаа ч илгээгдэхгүй.</p>
      </div>

      {!r ? (
        <form action={startPaperAction} className="card space-y-3">
          <p className="text-zinc-300">Шалгалт эхлээгүй байна. Эхлүүлсэн мөчөөс хойших дохионууд л тооцогдоно.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
            <li>Эхлэх цагийг дараа нь өөрчлөх боломжгүй. Ингэснээр тохиромжтой үеийг сонгож эхлүүлэх боломжгүй болно.</li>
            <li>Шалгуур: {PAPER_MIN_TRADES}-өөс дээш арилжаа, дундаж R ≥ {MIN_TEST_AVG_R}, profit factor ≥ {MIN_TEST_PROFIT_FACTOR}.</li>
            <li>Өдөрт ихдээ 1 арилжаа тул 3 орчим сар үргэлжилнэ. Үнийн дата тасралтгүй шинэчлэгдэж байх ёстой.</li>
          </ul>
          <button className="btn">Шалгалтыг эхлүүлэх</button>
        </form>
      ) : (
        <>
          <div className={`card border ${VERDICT[r.verdict].cls}`}>
            <div className="text-lg font-semibold">{VERDICT[r.verdict].title}</div>
            <p className="mt-1 text-sm text-zinc-300">{VERDICT[r.verdict].body}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={PAPER_MIN_TRADES} aria-valuenow={Math.min(r.stats.n, PAPER_MIN_TRADES)}>
              <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (r.stats.n / PAPER_MIN_TRADES) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-zinc-400">{r.stats.n} / {PAPER_MIN_TRADES} арилжаа · эхэлсэн {formatUbDateTime(r.startedAt)} (УБ)</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {([
              ["Цаасан данс", usd(r.balance), pnlClass(r.balance - r.startBalance)],
              ["Дундаж R", r.stats.avgR === null ? "—" : `${r.stats.avgR.toFixed(2)}R`],
              ["Profit factor", r.stats.profitFactor === null ? "—" : r.stats.profitFactor.toFixed(2)],
              ["Win rate", r.stats.winRate === null ? "—" : `${r.stats.winRate.toFixed(0)}%`],
            ] as [string, string, string?][]).map(([k, v, c]) => (
              <div key={k} className="card"><div className="text-xs text-zinc-400">{k}</div><div className={`mt-1 font-mono font-semibold ${c ?? ""}`}>{v}</div></div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card space-y-1 text-sm">
              <h2 className="mb-1 text-sm font-medium text-zinc-400">Өнөөдөр</h2>
              <p>{PHASE[r.today.phase]}</p>
              <p className="text-zinc-400">Азийн хүрээ: {r.today.rangeLow === null || r.today.rangeHigh === null ? "—" : `${price(r.today.rangeLow)} – ${price(r.today.rangeHigh)}`}</p>
              <p className="text-zinc-400">Өдрийн тренд: {r.today.trend === "UP" ? "өсөх (зөвхөн дээш гарвал орно)" : r.today.trend === "DOWN" ? "унах (зөвхөн доош гарвал орно)" : "тодорхойгүй (арилжаа хийхгүй)"}</p>
              <p className="text-xs text-zinc-500">Сүүлийн хаагдсан лаа: {r.lastBarAt ? `${formatUbDateTime(r.lastBarAt)} (УБ)` : "—"}</p>
            </div>
            <div className="card space-y-1 text-sm">
              <h2 className="mb-1 text-sm font-medium text-zinc-400">Нээлттэй арилжаа</h2>
              {r.open ? (
                <>
                  <p><span className={r.open.direction === "BUY" ? "text-emerald-400" : "text-red-400"}>{r.open.direction === "BUY" ? "Buy" : "Sell"}</span> {r.open.lots.toFixed(2)} лот · орсон {price(r.open.entryPrice)} · stop {price(r.open.stopLoss)}</p>
                  <p className="text-zinc-400">Нээсэн {formatUbDateTime(r.open.openedAt)} (УБ) · одоогийн үр дүн <span className={pnlClass(r.open.pnl)}>{usd(r.open.pnl)}</span></p>
                </>
              ) : <p className="text-zinc-500">Алга</p>}
            </div>
          </div>

          {r.closed.length > 0 && (
            <>
              <div className="card"><h2 className="mb-2 text-sm font-medium text-zinc-400">Цаасан дансны муруй</h2><EquityCurve points={r.closed.reduce<{ value: number }[]>((a, t) => [...a, { value: (a.at(-1)?.value ?? 0) + t.pnl }], [])} /></div>
              <div className="card overflow-x-auto p-0">
                <table className="w-full">
                  <thead><tr>{["Нээсэн (УБ)", "Чиглэл", "Лот", "Орсон", "Stop", "Гарсан", "Шалтгаан", "P&L", "R"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody>
                    {[...r.closed].reverse().map((t, i) => (
                      <tr key={i} className="border-t border-zinc-800">
                        <td className="td whitespace-nowrap font-mono">{formatUbDateTime(t.openedAt)}</td>
                        <td className={`td ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction === "BUY" ? "Buy" : "Sell"}</td>
                        <td className="td font-mono">{t.lots.toFixed(2)}</td>
                        <td className="td font-mono">{price(t.entryPrice)}</td>
                        <td className="td font-mono">{price(t.stopLoss)}</td>
                        <td className="td font-mono">{price(t.exitPrice)}</td>
                        <td className="td">{REASON[t.reason]}</td>
                        <td className={`td font-mono ${pnlClass(t.pnl)}`}>{usd(t.pnl)}</td>
                        <td className="td font-mono">{t.r.toFixed(2)}R</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="text-xs text-zinc-500">Арилжаанууд хадгалагдсан лаанаас дахин тооцогддог тул үнийн дата тасарсан өдрүүдэд дохио алдагдаж болно. Spread $0.30 тооцсон; slippage, swap тооцоогүй. Санхүүгийн зөвлөгөө биш.</p>
        </>
      )}
    </div>
  );
}
