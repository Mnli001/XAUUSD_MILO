import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTrades } from "@/lib/trades";
import { tradePnl, tradeR } from "@/lib/analysis/journal";
import { deleteTradeAction } from "@/lib/actions/trades";
import { usd, pnlClass } from "@/lib/format";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Журнал — XAU Analytics", "Journal — XAU Analytics") };
}

export default async function JournalPage() {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const trades = await listTrades(user.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">{t("Арилжааны журнал", "Trade journal")}</h1>
        <Link href="/journal/new" className="btn">{t("Арилжаа нэмэх", "Add trade")}</Link>
      </div>
      {trades.length === 0 ? (
        <div className="card text-zinc-400">{t("Одоогоор арилжаа бүртгээгүй байна. “Арилжаа нэмэх” товчоор эхний арилжаагаа оруулаарай.", "No trades recorded yet. Use “Add trade” to enter your first one.")}</div>
      ) : (
        <>
        <ul className="space-y-2.5 md:hidden">
          {trades.map((tr) => {
            const pnl = tradePnl(tr);
            const r = tradeR(tr);
            return (
              <li key={tr.id} className="card pb-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`font-semibold ${tr.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{tr.direction === "BUY" ? "Buy" : "Sell"} <span className="font-mono font-normal text-zinc-300">{tr.lots} {t("лот", "lots")}</span></span>
                  <span className={`font-mono text-lg font-semibold ${pnl === null ? "text-amber-400" : pnlClass(pnl)}`}>{pnl === null ? t("нээлттэй", "open") : usd(pnl)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-sm text-zinc-400">
                  <span>{tr.entryPrice} → {tr.exitPrice ?? "…"}</span>
                  <span>{r === null ? "" : `${r.toFixed(2)}R`}</span>
                </div>
                {tr.note && <p className="mt-2 line-clamp-2 text-sm text-zinc-300">{tr.note}{tr.imageMime && " 📎"}</p>}
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-zinc-800 pt-0.5 text-sm">
                  <span className="font-mono text-xs text-zinc-500">{v.dateTime(tr.openedAt)}</span>
                  <span className="flex items-center gap-1">
                    <Link href={`/journal/${tr.id}`} className="flex min-h-11 items-center px-2 text-amber-400">{t("Засах", "Edit")}</Link>
                    <form action={deleteTradeAction}><input type="hidden" name="id" value={tr.id} /><button className="min-h-11 px-2 text-red-400">{t("Устгах", "Delete")}</button></form>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="table-card hidden md:block">
          <table className="w-full">
            <thead><tr>{[`${t("Нээсэн", "Opened")} (${v.zone})`, t("Чиглэл", "Side"), t("Лот", "Lots"), t("Орсон", "Entry"), t("Гарсан", "Exit"), "P&L", "R", t("Тэмдэглэл", "Note"), ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {trades.map((tr) => {
                const pnl = tradePnl(tr);
                const r = tradeR(tr);
                return (
                  <tr key={tr.id} className="border-t border-zinc-800">
                    <td className="td whitespace-nowrap font-mono">{v.dateTime(tr.openedAt)}</td>
                    <td className={`td ${tr.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{tr.direction === "BUY" ? "Buy" : "Sell"}</td>
                    <td className="td font-mono">{tr.lots}</td>
                    <td className="td font-mono">{tr.entryPrice}</td>
                    <td className="td font-mono">{tr.exitPrice ?? <span className="text-amber-400">{t("нээлттэй", "open")}</span>}</td>
                    <td className={`td font-mono ${pnl === null ? "" : pnlClass(pnl)}`}>{pnl === null ? "—" : usd(pnl)}</td>
                    <td className="td font-mono">{r === null ? "—" : `${r.toFixed(2)}R`}</td>
                    <td className="td max-w-xs truncate text-zinc-400">{tr.note}{tr.imageMime && " 📎"}</td>
                    <td className="td whitespace-nowrap">
                      <Link href={`/journal/${tr.id}`} className="mr-3 text-amber-400">{t("Засах", "Edit")}</Link>
                      <form action={deleteTradeAction} className="inline">
                        <input type="hidden" name="id" value={tr.id} />
                        <button className="text-red-400">{t("Устгах", "Delete")}</button>
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
