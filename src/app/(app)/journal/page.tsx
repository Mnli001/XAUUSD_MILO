import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTrades } from "@/lib/trades";
import { tradePnl, tradeR } from "@/lib/analysis/journal";
import { deleteTradeAction } from "@/lib/actions/trades";
import { formatUbDateTime } from "@/lib/time";
import { usd, pnlClass } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Журнал — XAU Analytics" };

export default async function JournalPage() {
  const user = await requireUser();
  const trades = await listTrades(user.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Арилжааны журнал</h1>
        <Link href="/journal/new" className="btn">Арилжаа нэмэх</Link>
      </div>
      {trades.length === 0 ? (
        <div className="card text-zinc-400">Одоогоор арилжаа бүртгээгүй байна. “Арилжаа нэмэх” товчоор эхний арилжаагаа оруулаарай.</div>
      ) : (
        <>
        <ul className="space-y-2.5 md:hidden">
          {trades.map((t) => {
            const pnl = tradePnl(t);
            const r = tradeR(t);
            return (
              <li key={t.id} className="card pb-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`font-semibold ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction === "BUY" ? "Buy" : "Sell"} <span className="font-mono font-normal text-zinc-300">{t.lots} лот</span></span>
                  <span className={`font-mono text-lg font-semibold ${pnl === null ? "text-amber-400" : pnlClass(pnl)}`}>{pnl === null ? "нээлттэй" : usd(pnl)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-sm text-zinc-400">
                  <span>{t.entryPrice} → {t.exitPrice ?? "…"}</span>
                  <span>{r === null ? "" : `${r.toFixed(2)}R`}</span>
                </div>
                {t.note && <p className="mt-2 line-clamp-2 text-sm text-zinc-300">{t.note}{t.imageMime && " 📎"}</p>}
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-zinc-800 pt-0.5 text-sm">
                  <span className="font-mono text-xs text-zinc-500">{formatUbDateTime(t.openedAt)}</span>
                  <span className="flex items-center gap-1">
                    <Link href={`/journal/${t.id}`} className="flex min-h-11 items-center px-2 text-amber-400">Засах</Link>
                    <form action={deleteTradeAction}><input type="hidden" name="id" value={t.id} /><button className="min-h-11 px-2 text-red-400">Устгах</button></form>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="table-card hidden md:block">
          <table className="w-full">
            <thead><tr>{["Нээсэн (УБ)", "Чиглэл", "Лот", "Орсон", "Гарсан", "P&L", "R", "Тэмдэглэл", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {trades.map((t) => {
                const pnl = tradePnl(t);
                const r = tradeR(t);
                return (
                  <tr key={t.id} className="border-t border-zinc-800">
                    <td className="td whitespace-nowrap font-mono">{formatUbDateTime(t.openedAt)}</td>
                    <td className={`td ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction === "BUY" ? "Buy" : "Sell"}</td>
                    <td className="td font-mono">{t.lots}</td>
                    <td className="td font-mono">{t.entryPrice}</td>
                    <td className="td font-mono">{t.exitPrice ?? <span className="text-amber-400">нээлттэй</span>}</td>
                    <td className={`td font-mono ${pnl === null ? "" : pnlClass(pnl)}`}>{pnl === null ? "—" : usd(pnl)}</td>
                    <td className="td font-mono">{r === null ? "—" : `${r.toFixed(2)}R`}</td>
                    <td className="td max-w-xs truncate text-zinc-400">{t.note}{t.imageMime && " 📎"}</td>
                    <td className="td whitespace-nowrap">
                      <Link href={`/journal/${t.id}`} className="mr-3 text-amber-400">Засах</Link>
                      <form action={deleteTradeAction} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-red-400">Устгах</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
