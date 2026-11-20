"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveTradeAction } from "@/lib/actions/trades";
import type { FormState } from "@/lib/actions/session";

export type TradeFormValues = { id?: string; direction: "BUY" | "SELL"; lots: string; entryPrice: string; exitPrice: string; stopLoss: string; takeProfit: string; openedAt: string; closedAt: string; note: string; hasImage: boolean };

export function TradeForm({ initial }: { initial: TradeFormValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTradeAction, {});
  const num = (name: keyof TradeFormValues, label: string, required = false) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} type="number" step="any" min="0" inputMode="decimal" required={required} defaultValue={initial[name] as string} />
    </div>
  );
  return (
    <form action={action} className="card max-w-2xl space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="direction">Чиглэл</label>
          <select className="input" id="direction" name="direction" defaultValue={initial.direction}>
            <option value="BUY">Buy (өсөлт)</option>
            <option value="SELL">Sell (уналт)</option>
          </select>
        </div>
        {num("lots", "Лот", true)}
        {num("entryPrice", "Орсон үнэ", true)}
        {num("exitPrice", "Гарсан үнэ (нээлттэй бол хоосон)")}
        {num("stopLoss", "Stop loss")}
        {num("takeProfit", "Take profit")}
        <div>
          <label className="label" htmlFor="openedAt">Нээсэн огноо, цаг (УБ)</label>
          <input className="input" id="openedAt" name="openedAt" type="datetime-local" required defaultValue={initial.openedAt} />
        </div>
        <div>
          <label className="label" htmlFor="closedAt">Хаасан огноо, цаг (УБ)</label>
          <input className="input" id="closedAt" name="closedAt" type="datetime-local" defaultValue={initial.closedAt} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Тэмдэглэл</label>
        <textarea className="input" id="note" name="note" rows={3} maxLength={2000} defaultValue={initial.note} />
      </div>
      <div>
        <label className="label" htmlFor="image">Зураг (PNG, JPEG, WebP · 2MB хүртэл){initial.hasImage ? " — шинийг сонговол хуучныг солино" : ""}</label>
        <input className="input" id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
      </div>
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <div className="flex gap-3">
        <button className="btn" disabled={pending}>{pending ? "Хадгалж байна…" : "Хадгалах"}</button>
        <Link href="/journal" className="btn-ghost">Болих</Link>
      </div>
    </form>
  );
}
