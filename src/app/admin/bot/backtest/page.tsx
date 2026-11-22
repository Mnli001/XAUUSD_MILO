import { runBacktestFromDb, paramsFromQuery } from "@/lib/bot/run";
import { EquityCurve } from "@/components/EquityCurve";
import { usd, pnlClass } from "@/lib/format";
import { formatUbDateTime, ubDateKey } from "@/lib/time";
import type { Verdict, ExitReason } from "@/lib/bot/backtest";

export const dynamic = "force-dynamic";

const VERDICT: Record<Verdict, { title: string; body: string; cls: string }> = {
  INSUFFICIENT: { title: "Дүгнэхэд эрт", body: "Арилжааны тоо 30-аас цөөн тул статистик найдваргүй. Илүү урт түүх татах эсвэл шүүлтүүрийг сулруулж үзнэ.", cls: "border-zinc-600 text-zinc-200" },
  LOSING: { title: "Алдагдалтай", body: "Энэ тохиргоо өнгөрсөн хугацаанд мөнгө алдсан. Ийм дүрмээр бот ажиллуулж болохгүй.", cls: "border-red-500/60 text-red-300" },
  MARGINAL: { title: "Зааг дээр", body: "Ашиг бага эсвэл уналт их. Бодит зардал (slippage, swap) нэмэгдэхэд алдагдал руу орж магадгүй.", cls: "border-amber-500/60 text-amber-300" },
  PROMISING: { title: "Боломжийн", body: "Өнгөрсөн дата дээр ашигтай гарсан. Энэ бол баталгаа биш: demo данс дээр бодит цагт шалгах дараагийн алхмын үндэслэл л юм.", cls: "border-emerald-500/60 text-emerald-300" },
};
const REASON: Record<ExitReason, string> = { TP: "Target", SL: "Stop", BE: "Тэг (breakeven)", TIME: "Хугацаа дууссан", WEEKEND: "Амралтын өмнө", END: "Түүхийн төгсгөл" };

const FIELDS: [string, string, string][] = [
  ["minBias", "Хамгийн бага оноо", "1"], ["atrMult", "Stop = ATR ×", "0.1"], ["rr", "Target = stop ×", "0.1"], ["riskPct", "Эрсдэл, %", "0.05"],
  ["maxTradesPerDay", "Өдөрт арилжаа", "1"], ["dailyLossPct", "Өдрийн алдагдлын хязгаар, %", "0.1"], ["maxDrawdownPct", "Kill switch, %", "0.5"],
  ["sessionStartUb", "Эхлэх цаг (УБ)", "1"], ["sessionEndUb", "Дуусах цаг (УБ)", "1"], ["newsBeforeMin", "Мэдээний өмнө, мин", "5"],
  ["newsAfterMin", "Мэдээний дараа, мин", "5"], ["spread", "Spread, $", "0.05"], ["startBalance", "Эхлэх данс, $", "100"],
];

export default async function BotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // a checkbox paired with a hidden fallback arrives as two values; the last one wins
  const q = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v.at(-1) : v]));
  const { params, startBalance } = paramsFromQuery(q);
  const values: Record<string, number | boolean> = { ...params, startBalance };
  const r = q.run ? await runBacktestFromDb(params, startBalance) : null;
  const s = r?.stats;
  return (
    <div className="space-y-4">
      <div>
        <a href="/admin/bot" className="text-sm text-zinc-400 hover:text-white">← Бот</a>
        <h1 className="mt-1 text-xl font-semibold">Бот — backtest</h1>
        <p className="text-sm text-zinc-400">Арилжааны дүрмийг баазад байгаа түүхэн дата дээр ажиллуулж шалгана. Жинхэнэ болон demo захиалга өгөхгүй. <a href="/admin/bot/paper" className="text-amber-400">Цаасан арилжаа →</a></p>
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
          <label className="flex items-center gap-2"><input type="hidden" name="breakeven" value="0" /><input type="checkbox" name="breakeven" value="1" defaultChecked={params.breakeven} /> +1R-д stop-ыг орсон үнэ рүү зөөх</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="requireH1Agree" value="1" defaultChecked={params.requireH1Agree} /> 1 цагийн чарт мөн тохирсон байх</label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn">Backtest ажиллуулах</button>
          <a href="/admin/bot/backtest" className="btn-ghost">Анхны тохиргоо</a>
          <span className="text-xs text-zinc-500">Тохиргоог олон дахин өөрчилж хамгийн сайн тоог хайх нь өнгөрсөн датад тааруулах эрсдэлтэй.</span>
        </div>
      </form>

      {!r && <div className="card text-zinc-400">“Backtest ажиллуулах” товчийг дарна уу. Хэдэн секунд болно.</div>}

      {r && s && (
        <>
          <div className={`card border ${VERDICT[r.verdict].cls}`}>
            <div className="text-lg font-semibold">Дүгнэлт: {VERDICT[r.verdict].title}</div>
            <p className="mt-1 text-sm text-zinc-300">{VERDICT[r.verdict].body}</p>
          </div>

          {r.from === null ? (
            <div className="card text-zinc-400">Шалгах хангалттай түүхэн дата алга. Эхлээд <code>npm run backfill</code> ажиллуулна уу.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {([
                  ["Хугацаа", `${ubDateKey(r.from)} → ${r.to ? ubDateKey(r.to) : "—"}`],
                  ["Арилжаа / дохио", `${s.count} / ${r.signalCount}`],
                  ["Win rate", s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%`],
                  ["Profit factor", s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)],
                  ["Нийт P&L", `${usd(s.totalPnl)} (${r.returnPct.toFixed(2)}%)`, pnlClass(s.totalPnl)],
                  ["Дундаж R", s.avgR === null ? "—" : `${s.avgR.toFixed(2)}R`],
                  ["Хамгийн их уналт", `${r.maxDrawdownPct.toFixed(2)}%`, r.maxDrawdownPct >= params.maxDrawdownPct ? "text-red-400" : undefined],
                  ["Kill switch", r.killSwitchAt ? `${ubDateKey(r.killSwitchAt)}-нд асах байсан` : "асаагүй", r.killSwitchAt ? "text-red-400" : undefined],
                ] as [string, string, string?][]).map(([k, v, c]) => (
                  <div key={k} className="card"><div className="text-xs text-zinc-400">{k}</div><div className={`mt-1 font-mono font-semibold ${c ?? ""}`}>{v}</div></div>
                ))}
              </div>

              {s.count > 0 && (
                <>
                  <div className="card"><h2 className="card-title">Дансны муруй (P&L)</h2><EquityCurve points={s.equity} /></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="card">
                      <h2 className="card-title">Сараар</h2>
                      <table className="w-full">
                        <thead><tr><th className="th">Сар</th><th className="th">Арилжаа</th><th className="th">P&L</th></tr></thead>
                        <tbody>{r.months.map((m) => <tr key={m.month} className="border-t border-zinc-800"><td className="td font-mono">{m.month}</td><td className="td font-mono">{m.trades}</td><td className={`td font-mono ${pnlClass(m.pnl)}`}>{usd(m.pnl)}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="card">
                      <h2 className="card-title">Хэрхэн хаагдсан</h2>
                      <table className="w-full">
                        <tbody>{(Object.keys(REASON) as ExitReason[]).map((k) => <tr key={k} className="border-t border-zinc-800 first:border-t-0"><td className="td">{REASON[k]}</td><td className="td font-mono">{r.byReason[k]}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                  <div className="card overflow-x-auto p-0">
                    <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400">Сүүлийн 50 арилжаа</h2>
                    <table className="w-full">
                      <thead><tr>{["Нээсэн (УБ)", "Чиглэл", "Лот", "Орсон", "Stop", "Гарсан", "Шалтгаан", "P&L", "R"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                      <tbody>
                        {r.trades.slice(-50).reverse().map((t, i) => (
                          <tr key={i} className="border-t border-zinc-800">
                            <td className="td whitespace-nowrap font-mono">{formatUbDateTime(t.openedAt)}</td>
                            <td className={`td ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction === "BUY" ? "Buy" : "Sell"}</td>
                            <td className="td font-mono">{t.lots.toFixed(2)}</td>
                            <td className="td font-mono">{t.entryPrice.toFixed(2)}</td>
                            <td className="td font-mono">{t.stopLoss.toFixed(2)}</td>
                            <td className="td font-mono">{t.exitPrice.toFixed(2)}</td>
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
            </>
          )}

          <div className="card text-xs text-zinc-500">
            <p className="mb-1 font-medium text-zinc-400">Энэ шалгалтын хязгаар</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Шийдвэр гаргах мөчид зөвхөн бүрэн хаагдсан лааг ашигласан; нэг лаанд stop, target хоёулаа хүрвэл stop гэж тооцсон.</li>
              <li>Spread-ийг орох үнэд нэмсэн. Slippage, swap, брокерын шимтгэл тооцоогүй тул бодит үр дүн үүнээс муу байх магадлалтай.</li>
              <li>Баазад байхгүй өнгөрсөн мэдээ (жишээ нь өмнөх FOMC) шүүгдээгүй.</li>
              <li>Өнгөрсөн үр дүн ирээдүйн ашгийг батлахгүй. Санхүүгийн зөвлөгөө биш.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
