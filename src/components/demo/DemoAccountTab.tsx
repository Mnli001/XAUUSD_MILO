"use client";
import { useState } from "react";
import type { DemoView } from "@/lib/demo/view";
import { useViewer } from "../PrefsProvider";
import { cash, demoAction, errorText, num } from "./common";

/** Money in and out, a fresh start, the account's name and help level, and closing the account for good. */
export function DemoAccountTab({ view, onDone, onDeleted }: { view: DemoView; onDone: (v: DemoView, m: string) => void; onDeleted: () => void }) {
  const v = useViewer();
  const { t } = v;
  const a = view.account;
  const [amount, setAmount] = useState("1000");
  const [name, setName] = useState(a.name);
  const [beginner, setBeginner] = useState(a.beginner);
  const [sure, setSure] = useState<"reset" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function money(kind: "DEPOSIT" | "WITHDRAW" | "RESET") {
    if (kind === "RESET" && sure !== "reset") return setSure("reset");
    setSure(null);
    setError(null);
    const r = await demoAction({ action: "cash", account: a.id, kind, amount: num(amount) ?? 0 });
    if (r.error || !r.view) return setError(errorText(r.error, t));
    onDone(r.view, kind === "DEPOSIT" ? t("Мөнгө нэмэгдлээ", "Money added") : kind === "WITHDRAW" ? t("Мөнгө гарлаа", "Money withdrawn") : t("Данс шинээр эхэллээ", "The account starts over"));
  }
  async function save() {
    const r = await demoAction({ action: "settings", account: a.id, name, beginner });
    if (r.error || !r.view) return setError(errorText(r.error, t));
    onDone(r.view, t("Хадгалагдлаа", "Saved"));
  }
  async function remove() {
    if (sure !== "delete") return setSure("delete");
    const r = await demoAction({ action: "delete", account: a.id });
    if (r.deleted) onDeleted();
  }
  const kind = (k: string) => (k === "OPEN" ? t("Нээсэн", "Opened") : k === "DEPOSIT" ? t("Нэмсэн", "Added") : k === "WITHDRAW" ? t("Гаргасан", "Withdrawn") : t("Шинээр эхэлсэн", "Started over"));

  return (
    <div className="grid gap-5 p-4 lg:grid-cols-2">
      <section aria-labelledby="cash-h" className="space-y-3">
        <h3 id="cash-h" className="text-sm font-semibold text-zinc-100">{t("Мөнгө", "Money")}</h3>
        <p className="text-xs leading-relaxed text-zinc-400">{t(`Одоо ${cash(a.balance)}, эхэлсэн ${cash(a.startBalance)}. Мөнгө нэмэх, гаргах, эсвэл бүх арилжааг устгаж шинэ дүнгээр дахин эхлэх.`, `Now ${cash(a.balance)}, started with ${cash(a.startBalance)}. Add money, take it out, or wipe every trade and start again with a new amount.`)}</p>
        <div className="flex flex-wrap gap-2">
          <input aria-label={t("Мөнгөн дүн", "Amount")} className="input w-36 tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="btn-ghost" onClick={() => money("DEPOSIT")}>{t("Нэмэх", "Add")}</button>
          <button type="button" className="btn-ghost" onClick={() => money("WITHDRAW")}>{t("Гаргах", "Withdraw")}</button>
          <button type="button" className="btn-ghost" onClick={() => money("RESET")}>{sure === "reset" ? t("Тийм, бүгдийг устгаж эхлэх", "Yes, wipe and start over") : t("Шинээр эхлэх", "Start over")}</button>
        </div>
        {sure === "reset" && <p className="text-xs text-amber-300">{t(`Бүх арилжаа, түүх устаж данс ${cash(num(amount) ?? 0)}-оор дахин эхэлнэ.`, `Every trade and the history are wiped and the account restarts at ${cash(num(amount) ?? 0)}.`)}</p>}
        {view.cash.length > 0 && (
          <ul className="space-y-1 text-xs text-zinc-400 tabular-nums">
            {view.cash.slice(0, 8).map((c, i) => <li key={i}>{v.dateTime(new Date(c.at))} · {kind(c.kind)} {cash(c.amount)} → {cash(c.balanceAfter)}</li>)}
          </ul>
        )}
      </section>
      <section aria-labelledby="set-h" className="space-y-3">
        <h3 id="set-h" className="text-sm font-semibold text-zinc-100">{t("Тохиргоо", "Settings")}</h3>
        <label className="block text-xs text-zinc-400">{t("Нэр", "Name")}<input className="input mt-1" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" className="mt-1" checked={beginner} onChange={(e) => setBeginner(e.target.checked)} />
          <span>{t("Суралцах горим: даалгавар, анхааруулга, арилжаа нээхээс өмнө баталгаажуулах", "Learning mode: tasks, warnings and a confirmation before risky trades")}</span>
        </label>
        <p className="text-xs text-zinc-500">Leverage 1:{a.leverage}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={save}>{t("Хадгалах", "Save")}</button>
          <button type="button" className="btn-ghost text-red-300" onClick={remove}>{sure === "delete" ? t("Тийм, дансыг устгах", "Yes, delete the account") : t("Дансыг устгах", "Delete account")}</button>
        </div>
      </section>
      {error && <p role="alert" className="text-sm text-red-400 lg:col-span-2">{error}</p>}
    </div>
  );
}
