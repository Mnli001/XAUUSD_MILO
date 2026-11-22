"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveTradeAction } from "@/lib/actions/trades";
import type { FormState } from "@/lib/actions/session";
import { useViewer } from "./PrefsProvider";

export type TradeFormValues = { id?: string; direction: "BUY" | "SELL"; lots: string; entryPrice: string; exitPrice: string; stopLoss: string; takeProfit: string; openedAt: string; closedAt: string; note: string; hasImage: boolean };

export function TradeForm({ initial }: { initial: TradeFormValues }) {
  const { t, zone } = useViewer();
  const [state, action, pending] = useActionState<FormState, FormData>(saveTradeAction, {});
  const num = (name: keyof TradeFormValues, label: string, required = false, placeholder?: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} type="number" step="any" min="0" inputMode="decimal" required={required} placeholder={placeholder} defaultValue={initial[name] as string} />
    </div>
  );
  return (
    <form action={action} className="card max-w-2xl space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="direction">{t("Чиглэл", "Direction")}</label>
          <select className="input" id="direction" name="direction" defaultValue={initial.direction}>
            <option value="BUY">{t("Buy (өсөлт)", "Buy (long)")}</option>
            <option value="SELL">{t("Sell (уналт)", "Sell (short)")}</option>
          </select>
        </div>
        {num("lots", t("Лот", "Lots"), true)}
        {num("entryPrice", t("Орсон үнэ", "Entry price"), true)}
        {num("exitPrice", t("Гарсан үнэ", "Exit price"), false, t("хоосон = нээлттэй", "empty = still open"))}
        {num("stopLoss", "Stop loss")}
        {num("takeProfit", "Take profit")}
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="openedAt">{t("Нээсэн огноо, цаг", "Opened: date, time")} ({zone})</label>
          <input className="input" id="openedAt" name="openedAt" type="datetime-local" required defaultValue={initial.openedAt} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="closedAt">{t("Хаасан огноо, цаг", "Closed: date, time")} ({zone})</label>
          <input className="input" id="closedAt" name="closedAt" type="datetime-local" defaultValue={initial.closedAt} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">{t("Тэмдэглэл", "Note")}</label>
        <textarea className="input" id="note" name="note" rows={3} maxLength={2000} defaultValue={initial.note} />
      </div>
      <div>
        <label className="label" htmlFor="image">{t("Зураг (PNG, JPEG, WebP · 2MB хүртэл)", "Screenshot (PNG, JPEG, WebP · up to 2MB)")}{initial.hasImage ? t(" — шинийг сонговол хуучныг солино", " — choosing a new one replaces the old") : ""}</label>
        <input className="input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200" id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
      </div>
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <div className="flex gap-3">
        <button className="btn max-sm:flex-1" disabled={pending}>{pending ? t("Хадгалж байна…", "Saving…") : t("Хадгалах", "Save")}</button>
        <Link href="/journal" className="btn-ghost">{t("Болих", "Cancel")}</Link>
      </div>
    </form>
  );
}
