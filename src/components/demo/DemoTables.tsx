"use client";
import { useState } from "react";
import { closePriceFor, pnl, roundLots } from "@/lib/demo/engine";
import type { DemoOrderView, DemoView } from "@/lib/demo/view";
import { useViewer } from "../PrefsProvider";
import { demoAction, errorText, num, px, reasonText, tone, usd } from "./common";

type Price = { bid: number; ask: number } | null;
type Done = (view: DemoView, message: string) => void;
const th = "px-3 py-2 text-left text-xs font-medium text-zinc-500 whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const act = "min-h-8 rounded-lg border border-zinc-700 px-2.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-40";

function Exits({ o, accountId, onDone, onCancel }: { o: DemoOrderView; accountId: string; onDone: Done; onCancel: () => void }) {
  const { t } = useViewer();
  const [sl, setSl] = useState(o.sl?.toFixed(2) ?? "");
  const [tp, setTp] = useState(o.tp?.toFixed(2) ?? "");
  const [at, setAt] = useState(o.price?.toFixed(2) ?? "");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const r = await demoAction({ action: "modify", account: accountId, id: o.id, sl: num(sl), tp: num(tp), price: o.status === "PENDING" ? num(at) : null });
    if (r.error || !r.view) return setError(errorText(r.error, t));
    onDone(r.view, t("Өөрчлөгдлөө", "Updated"));
  }
  return (
    <div className="flex flex-wrap items-end gap-2 py-1">
      {o.status === "PENDING" && <label className="text-xs text-zinc-400">{t("Үнэ", "Price")}<input className="input mt-1 w-28 tabular-nums" inputMode="decimal" value={at} onChange={(e) => setAt(e.target.value)} /></label>}
      <label className="text-xs text-zinc-400">SL<input className="input mt-1 w-28 tabular-nums" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} /></label>
      <label className="text-xs text-zinc-400">TP<input className="input mt-1 w-28 tabular-nums" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} /></label>
      <button type="button" className={act} onClick={save}>{t("Хадгалах", "Save")}</button>
      <button type="button" className={act} onClick={onCancel}>{t("Болих", "Cancel")}</button>
      {error && <p role="alert" className="w-full text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function PositionsTable({ view, price, onDone }: { view: DemoView; price: Price; onDone: Done }) {
  const { t } = useViewer();
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = view.account.id;
  async function run(key: string, payload: Record<string, unknown>, ok: (r: { profit?: number }) => string) {
    setBusy(key);
    setError(null);
    const r = await demoAction({ account: id, ...payload });
    setBusy(null);
    if (r.error || !r.view) return setError(errorText(r.error, t));
    onDone(r.view, ok(r));
  }
  if (!view.positions.length) return <p className="px-4 py-6 text-sm text-zinc-500">{t("Нээлттэй арилжаа алга. Баруун талын захиалгаас BUY эсвэл SELL нээнэ үү.", "No open trades. Open a BUY or SELL from the order ticket.")}</p>;
  return (
    <div className="overflow-x-auto">
      {view.positions.length > 1 && (
        <div className="flex justify-end px-3 pt-3">
          <button type="button" className={act} disabled={!price || busy !== null} onClick={() => run("all", { action: "closeAll" }, () => t("Бүгд хаагдлаа", "All closed"))}>{t("Бүгдийг хаах", "Close all")}</button>
        </div>
      )}
      <table className="w-full border-collapse text-sm" aria-label={t("Нээлттэй арилжаа", "Open trades")}>
        <thead><tr><th className={th}>{t("Тал", "Side")}</th><th className={th}>Lot</th><th className={th}>{t("Нээсэн", "Open")}</th><th className={th}>{t("Одоо", "Now")}</th><th className={th}>SL</th><th className={th}>TP</th><th className={`${th} text-right`}>P&L</th><th className={th} /></tr></thead>
        <tbody>
          {view.positions.map((o) => {
            const now = price ? closePriceFor(o.side, price) : null;
            const p = now !== null ? pnl(o.side, o.lots, o.openPrice!, now) : null;
            const half = roundLots(o.lots / 2);
            return [
              <tr key={o.id} className="border-t border-zinc-800/70">
                <td className={`${td} font-semibold ${o.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{o.side}</td>
                <td className={td}>{o.lots.toFixed(2)}</td>
                <td className={td}>{px(o.openPrice!)}</td>
                <td className={td}>{now !== null ? px(now) : "—"}</td>
                <td className={`${td} text-zinc-400`}>{o.sl !== null ? px(o.sl) : <span className="text-amber-400">{t("байхгүй", "none")}</span>}</td>
                <td className={`${td} text-zinc-400`}>{o.tp !== null ? px(o.tp) : "—"}</td>
                <td className={`${td} text-right font-semibold ${p !== null ? tone(p) : ""}`}>{p !== null ? usd(p) : "—"}</td>
                <td className={`${td} space-x-1.5 text-right`}>
                  <button type="button" className={act} onClick={() => setEdit(edit === o.id ? null : o.id)}>SL/TP</button>
                  <button type="button" className={act} title={t("SL-ийг нээсэн үнэ рүү зөөх: цаашид алдагдалгүй", "Move the stop to the entry: no loss from here")}
                    disabled={!price || busy !== null || (p ?? 0) <= 0} onClick={() => run(`be${o.id}`, { action: "modify", id: o.id, sl: o.openPrice, tp: o.tp }, () => t("SL breakeven рүү зөөгдлөө", "Stop moved to breakeven"))}>BE</button>
                  {half >= 0.01 && <button type="button" className={act} disabled={!price || busy !== null} onClick={() => run(`h${o.id}`, { action: "close", id: o.id, lots: half }, (r) => t(`Хагасыг хаалаа ${usd(r.profit ?? 0)}`, `Half closed ${usd(r.profit ?? 0)}`))}>½</button>}
                  <button type="button" className={`${act} border-red-500/50 text-red-300`} disabled={!price || busy !== null} onClick={() => run(`c${o.id}`, { action: "close", id: o.id }, (r) => t(`Хаагдлаа ${usd(r.profit ?? 0)}`, `Closed ${usd(r.profit ?? 0)}`))}>{t("Хаах", "Close")}</button>
                </td>
              </tr>,
              edit === o.id && <tr key={`${o.id}-e`}><td colSpan={8} className="px-3"><Exits o={o} accountId={id} onDone={(v, m) => { setEdit(null); onDone(v, m); }} onCancel={() => setEdit(null)} /></td></tr>,
              o.note && <tr key={`${o.id}-n`}><td colSpan={8} className="px-3 pb-2 text-xs text-zinc-500">“{o.note}”</td></tr>,
            ];
          })}
        </tbody>
      </table>
      {error && <p role="alert" className="px-3 py-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export function PendingTable({ view, price, onDone }: { view: DemoView; price: Price; onDone: Done }) {
  const { t } = useViewer();
  const [edit, setEdit] = useState<string | null>(null);
  const id = view.account.id;
  if (!view.pending.length) return <p className="px-4 py-6 text-sm text-zinc-500">{t("Хүлээгдэж буй захиалга алга. Limit эсвэл Stop захиалга нь үнэ тухайн түвшинд хүрэхэд автоматаар нээгдэнэ.", "No pending orders. A Limit or Stop order opens on its own when the price reaches its level.")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label={t("Хүлээгдэж буй захиалга", "Pending orders")}>
        <thead><tr><th className={th}>{t("Төрөл", "Type")}</th><th className={th}>Lot</th><th className={th}>{t("Үнэ", "Price")}</th><th className={th}>{t("Зай", "Distance")}</th><th className={th}>SL</th><th className={th}>TP</th><th className={th} /></tr></thead>
        <tbody>
          {view.pending.map((o) => {
            const ref = price ? (o.side === "BUY" ? price.ask : price.bid) : null;
            return [
              <tr key={o.id} className="border-t border-zinc-800/70">
                <td className={`${td} font-semibold ${o.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{o.side} {o.type === "LIMIT" ? "Limit" : "Stop"}</td>
                <td className={td}>{o.lots.toFixed(2)}</td>
                <td className={td}>{px(o.price!)}</td>
                <td className={`${td} text-zinc-400`}>{ref !== null ? `$${Math.abs(ref - o.price!).toFixed(2)}` : "—"}</td>
                <td className={`${td} text-zinc-400`}>{o.sl !== null ? px(o.sl) : "—"}</td>
                <td className={`${td} text-zinc-400`}>{o.tp !== null ? px(o.tp) : "—"}</td>
                <td className={`${td} space-x-1.5 text-right`}>
                  <button type="button" className={act} onClick={() => setEdit(edit === o.id ? null : o.id)}>{t("Засах", "Edit")}</button>
                  <button type="button" className={`${act} border-red-500/50 text-red-300`} onClick={async () => { const r = await demoAction({ action: "cancel", account: id, id: o.id }); if (r.view) onDone(r.view, t("Захиалга цуцлагдлаа", "Order cancelled")); }}>{t("Цуцлах", "Cancel")}</button>
                </td>
              </tr>,
              edit === o.id && <tr key={`${o.id}-e`}><td colSpan={7} className="px-3"><Exits o={o} accountId={id} onDone={(v, m) => { setEdit(null); onDone(v, m); }} onCancel={() => setEdit(null)} /></td></tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function held(ms: number, t: (mn: string, en: string) => string) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return t(`${m} мин`, `${m} min`);
  const h = Math.floor(m / 60);
  return h < 48 ? t(`${h} ц ${m % 60} мин`, `${h}h ${m % 60}m`) : t(`${Math.floor(h / 24)} өдөр`, `${Math.floor(h / 24)} days`);
}

export function HistoryTable({ view }: { view: DemoView }) {
  const v = useViewer();
  const { t } = v;
  if (!view.history.length) return <p className="px-4 py-6 text-sm text-zinc-500">{t("Хаасан арилжаа хараахан алга.", "No closed trades yet.")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label={t("Арилжааны түүх", "Trade history")}>
        <thead><tr><th className={th}>{t("Хаасан", "Closed")}</th><th className={th}>{t("Тал", "Side")}</th><th className={th}>Lot</th><th className={th}>{t("Нээсэн → хаасан", "Open → close")}</th><th className={th}>{t("Шалтгаан", "Reason")}</th><th className={th}>{t("Барьсан", "Held")}</th><th className={`${th} text-right`}>P&L</th></tr></thead>
        <tbody>
          {view.history.slice(0, 100).map((o) => [
            <tr key={o.id} className="border-t border-zinc-800/70">
              <td className={`${td} text-zinc-400`}>{v.dateTime(new Date(o.closedAt!))}</td>
              <td className={`${td} font-semibold ${o.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{o.side}</td>
              <td className={td}>{o.lots.toFixed(2)}</td>
              <td className={td}>{px(o.openPrice!)} → {px(o.closePrice!)}</td>
              <td className={td}><span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${o.closeReason === "TP" ? "bg-emerald-500/15 text-emerald-300" : o.closeReason === "SL" || o.closeReason === "STOPOUT" ? "bg-red-500/15 text-red-300" : "bg-zinc-700/60 text-zinc-300"}`}>{reasonText(o.closeReason, t)}</span></td>
              <td className={`${td} text-zinc-400`}>{o.openedAt ? held(o.closedAt! - o.openedAt, t) : "—"}</td>
              <td className={`${td} text-right font-semibold ${tone(o.profit ?? 0)}`}>{usd(o.profit ?? 0)}</td>
            </tr>,
            o.note && <tr key={`${o.id}-n`}><td colSpan={7} className="px-3 pb-2 text-xs text-zinc-500">“{o.note}”</td></tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}
