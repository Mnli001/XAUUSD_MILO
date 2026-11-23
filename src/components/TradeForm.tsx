"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveTradeAction } from "@/lib/actions/trades";
import type { FormState } from "@/lib/actions/session";
import { useViewer } from "./PrefsProvider";
import { Dir } from "./Timetable";

export type TradeFormValues = { id?: string; direction: "BUY" | "SELL"; lots: string; entryPrice: string; exitPrice: string; stopLoss: string; takeProfit: string; openedAt: string; closedAt: string; note: string; hasImage: boolean };

export function TradeForm({ initial }: { initial: TradeFormValues }) {
  const { t, zone } = useViewer();
  const [state, action, pending] = useActionState<FormState, FormData>(saveTradeAction, {});
  const num = (name: keyof TradeFormValues, label: string, required = false, placeholder?: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input tabular-nums" id={name} name={name} type="number" step="any" min="0" inputMode="decimal" required={required} placeholder={placeholder} defaultValue={initial[name] as string} />
    </div>
  );
  const sides = [
    ["BUY", 1, t("Buy (өсөлт)", "Buy (long)"), "peer-checked:border-emerald-400 peer-checked:bg-emerald-500/15 peer-checked:text-emerald-400"],
    ["SELL", -1, t("Sell (уналт)", "Sell (short)"), "peer-checked:border-red-400 peer-checked:bg-red-500/15 peer-checked:text-red-400"],
  ] as const;
  const group = "border-t border-zinc-800 pt-4";
  return (
    <form action={action} className="card max-w-2xl space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <fieldset>
        <legend className="label">{t("Чиглэл", "Direction")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {sides.map(([value, arrow, text, on]) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="direction" value={value} defaultChecked={initial.direction === value} className="peer sr-only" />
              <span className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-400 ${on}`}>
                <Dir d={arrow} />{text}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={`grid grid-cols-2 gap-4 ${group}`}>
        {num("lots", t("Лот", "Lots"), true)}
        {num("entryPrice", t("Орсон үнэ", "Entry price"), true)}
        {num("stopLoss", "Stop loss")}
        {num("takeProfit", "Take profit")}
        <div className="col-span-2">
          <label className="label" htmlFor="openedAt">{t("Нээсэн огноо, цаг", "Opened: date, time")} ({zone})</label>
          <input className="input tabular-nums" id="openedAt" name="openedAt" type="datetime-local" required defaultValue={initial.openedAt} />
        </div>
      </div>
      <div className={`grid grid-cols-2 gap-4 ${group}`}>
        <div className="col-span-2 sm:col-span-1">{num("exitPrice", t("Гарсан үнэ", "Exit price"), false, t("хоосон = нээлттэй", "empty = still open"))}</div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="closedAt">{t("Хаасан огноо, цаг", "Closed: date, time")} ({zone})</label>
          <input className="input tabular-nums" id="closedAt" name="closedAt" type="datetime-local" defaultValue={initial.closedAt} />
        </div>
      </div>
      <div className={`space-y-4 ${group}`}>
        <div>
          <label className="label" htmlFor="note">{t("Тэмдэглэл", "Note")}</label>
          <textarea className="input" id="note" name="note" rows={3} maxLength={2000} defaultValue={initial.note} />
        </div>
        <div>
          <label className="label" htmlFor="image">{t("Зураг (PNG, JPEG, WebP · 2MB хүртэл)", "Screenshot (PNG, JPEG, WebP · up to 2MB)")}{initial.hasImage ? t(" — шинийг сонговол хуучныг солино", " — choosing a new one replaces the old") : ""}</label>
          <input className="input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200" id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
        </div>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>}
      <div className="flex gap-3">
        <button className="btn max-sm:flex-1" disabled={pending}>{pending ? t("Хадгалж байна…", "Saving…") : t("Хадгалах", "Save")}</button>
        <Link href="/journal" className="btn-ghost">{t("Болих", "Cancel")}</Link>
      </div>
    </form>
  );
}
