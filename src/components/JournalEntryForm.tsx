"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteManualTradeAction, saveManualTradeAction, type JournalFormState } from "@/lib/actions/journal";
import { NOTE_MAX, manualProfit } from "@/lib/journalForm";
import { useT } from "./PrefsProvider";

/** A written trade as the form shows it: the reader's wall clock, prices as typed. */
export type EntryValues = { ticket?: string; date: string; openAt: string; closeAt: string; side: "BUY" | "SELL"; openPrice: string; closePrice: string; lots: string; stopLoss: string; note: string };

const blank = (date: string): EntryValues => ({ date, openAt: "", closeAt: "", side: "BUY", openPrice: "", closePrice: "", lots: "0.01", stopLoss: "", note: "" });
const n = (s: string) => Number(s.replace(",", "."));
const money = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}$${Math.abs(x).toFixed(2)}`;

/**
 * Writing a closed trade into the journal by hand: date and times on the reader's clock, side, entry, exit, lots, and
 * an optional stop and note. The P/L is worked out as you type (1 lot = 100 oz), and the same sum is stored.
 * With `initial.ticket` it edits that trade. Open to every signed-in member, robot or not.
 */
export function JournalEntryForm({ today, initial, zone }: { today: string; initial?: EntryValues | null; zone: string }) {
  const t = useT();
  const router = useRouter();
  const editing = !!initial?.ticket;
  const [state, action, pending] = useActionState<JournalFormState, FormData>(saveManualTradeAction, {});
  const [f, setF] = useState<EntryValues>(initial ?? blank(today));
  const set = <K extends keyof EntryValues>(k: K, val: EntryValues[K]) => setF((o) => ({ ...o, [k]: val }));

  // A saved new trade clears the form for the next one (keeping the date and lot); a saved edit goes back to the journal.
  const [seen, setSeen] = useState(state.saved);
  if (state.saved !== seen) {
    setSeen(state.saved);
    if (!editing) setF((o) => ({ ...blank(o.date), lots: o.lots }));
  }
  useEffect(() => { if (state.saved && editing) router.replace("/journal"); }, [state.saved, editing, router]);

  const open = n(f.openPrice), close = n(f.closePrice), lots = n(f.lots), stop = n(f.stopLoss);
  const ready = open > 0 && close > 0 && lots > 0;
  const pnl = ready ? manualProfit({ side: f.side, lots, openPrice: open, closePrice: close }) : null;
  const risk = ready && stop > 0 ? Math.abs(open - stop) : 0;
  const r = pnl !== null && risk > 0 ? pnl / (risk * lots * 100) : null;

  const field = "input tabular-nums";
  return (
    <form action={action} className="space-y-4" aria-label={editing ? t("Арилжаа засах", "Edit trade") : t("Арилжаа нэмэх", "Add a trade")}>
      {f.ticket && <input type="hidden" name="ticket" value={f.ticket} />}
      <fieldset>
        <legend className="label">{t("Чиглэл", "Side")}</legend>
        <div className="inline-grid grid-cols-2 gap-1 rounded-2xl border p-1" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
          {(["BUY", "SELL"] as const).map((s) => (
            <label key={s} className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-bold transition-colors motion-reduce:transition-none ${f.side === s ? (s === "BUY" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300") : "text-zinc-400 hover:text-zinc-200"}`}>
              <input type="radio" name="side" value={s} checked={f.side === s} onChange={() => set("side", s)} className="sr-only" />
              <span aria-hidden>{s === "BUY" ? "▲" : "▼"}</span>{s}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 min-w-0 sm:col-span-1"><span className="label">{t(`Огноо (${zone})`, `Date (${zone})`)}</span>
          <input type="date" name="date" required className={field} value={f.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className="min-w-0"><span className="label">{t("Нээсэн цаг", "Opened at")}</span>
          <input type="time" name="openAt" required className={field} value={f.openAt} onChange={(e) => set("openAt", e.target.value)} /></label>
        <label className="min-w-0"><span className="label">{t("Хаасан цаг", "Closed at")} <span className="font-normal text-zinc-500">{t("(заавал биш)", "(optional)")}</span></span>
          <input type="time" name="closeAt" className={field} value={f.closeAt} onChange={(e) => set("closeAt", e.target.value)} /></label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="min-w-0"><span className="label">{t("Орсон үнэ", "Entry")}</span>
          <input name="openPrice" inputMode="decimal" required placeholder="4050.20" className={field} value={f.openPrice} onChange={(e) => set("openPrice", e.target.value)} /></label>
        <label className="min-w-0"><span className="label">{t("Гарсан үнэ", "Exit")}</span>
          <input name="closePrice" inputMode="decimal" required placeholder="4062.80" className={field} value={f.closePrice} onChange={(e) => set("closePrice", e.target.value)} /></label>
        <label className="min-w-0"><span className="label">Lot</span>
          <input name="lots" inputMode="decimal" required className={field} value={f.lots} onChange={(e) => set("lots", e.target.value)} /></label>
        <label className="min-w-0"><span className="label">Stop <span className="font-normal text-zinc-500">{t("(заавал биш)", "(optional)")}</span></span>
          <input name="stopLoss" inputMode="decimal" className={field} value={f.stopLoss} onChange={(e) => set("stopLoss", e.target.value)} /></label>
      </div>

      <label className="block"><span className="label">{t("Тэмдэглэл", "Note")} <span className="font-normal text-zinc-500">{t("(заавал биш)", "(optional)")}</span></span>
        <textarea name="note" rows={2} maxLength={NOTE_MAX} className="input min-h-16 resize-y" placeholder={t("Яагаад орсон, юу сурсан бэ", "Why you entered, what you learned")} value={f.note} onChange={(e) => set("note", e.target.value)} /></label>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button className="btn" disabled={pending}>{pending ? t("Хадгалж байна…", "Saving…") : editing ? t("Өөрчлөлтийг хадгалах", "Save changes") : t("Журналд нэмэх", "Add to journal")}</button>
        {editing && <Link href="/journal" className="btn-ghost">{t("Болих", "Cancel")}</Link>}
        <p className="text-sm text-zinc-400 tabular-nums" aria-live="polite">
          {pnl === null ? t("Үнэ, lot-оо оруулахад ашиг/алдагдал энд гарна.", "The P/L shows here once prices and lots are in.") : (
            <>{t("Дүн", "Result")} <strong className={`font-semibold ${pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-zinc-200"}`}>{money(pnl)}</strong>{r !== null && <> · {r >= 0 ? "+" : "−"}{Math.abs(r).toFixed(2)}R</>}</>
          )}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">{t("Дүнг (гарсан − орсон) × чиглэл × lot × 100 унцаар тооцно; swap, шимтгэл ороогүй. Хаасан цаг нээсэн цагаас эрт бол дараагийн өдөр гэж үзнэ.", "The result is (exit − entry) × side × lots × 100 oz; swap and fees not included. A close earlier than the open counts as the next day.")}</p>
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      {state.ok && !state.error && <p role="status" className="text-sm text-emerald-400">{state.ok}</p>}
    </form>
  );
}

/** Deletes one written trade after a confirm. */
export function DeleteTradeButton({ ticket }: { ticket: string }) {
  const t = useT();
  const ask = (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(t("Энэ арилжааг журналаас устгах уу? Буцаах боломжгүй.", "Delete this trade from the journal? This cannot be undone."))) e.preventDefault();
  };
  return (
    <form action={deleteManualTradeAction} className="inline">
      <input type="hidden" name="ticket" value={ticket} />
      <button className="text-xs font-semibold text-zinc-400 hover:text-red-300" onClick={ask} aria-label={t("Устгах", "Delete")}>{t("Устгах", "Delete")}</button>
    </form>
  );
}
