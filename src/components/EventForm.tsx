"use client";
import { useActionState } from "react";
import { saveEventAction, type AdminState } from "@/lib/actions/admin";

export type EventFormValues = { id?: string; type: string; title: string; ubDate: string; ubTime: string; impact: string; forecast: string; previous: string; actual: string };

export function EventForm({ initial, types }: { initial: EventFormValues; types: { type: string; title: string }[] }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveEventAction, {});
  const text = (name: keyof EventFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={`${initial.id ?? "new"}-${name}`}>{label}</label><input className="input" id={`${initial.id ?? "new"}-${name}`} name={name} defaultValue={initial[name]} {...props} /></div>
  );
  return (
    <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {text("type", "Төрөл (жишээ: FOMC)", { required: true, list: "event-types", maxLength: 30 })}
      <datalist id="event-types">{types.map((t) => <option key={t.type} value={t.type}>{t.title}</option>)}</datalist>
      <div className="col-span-2">{text("title", "Гарчиг", { required: true, maxLength: 120 })}</div>
      <div>
        <label className="label" htmlFor={`${initial.id ?? "new"}-impact`}>Нөлөөлөл</label>
        <select className="input" id={`${initial.id ?? "new"}-impact`} name="impact" defaultValue={initial.impact}>
          <option value="HIGH">Өндөр</option><option value="MEDIUM">Дунд</option><option value="LOW">Бага</option>
        </select>
      </div>
      {text("ubDate", "Огноо (УБ)", { type: "date", required: true })}
      {text("ubTime", "Цаг (УБ)", { type: "time", required: true })}
      {text("forecast", "Таамаг", { maxLength: 40 })}
      {text("previous", "Өмнөх", { maxLength: 40 })}
      {text("actual", "Бодит", { maxLength: 40 })}
      <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-3 sm:items-end">
        <button className="btn" disabled={pending}>{pending ? "Хадгалж байна…" : initial.id ? "Хадгалах" : "Мэдээ нэмэх"}</button>
        {state.error && <span role="alert" className="text-sm text-red-400">{state.error}</span>}
        {state.ok && <span role="status" className="text-sm text-emerald-400">{state.ok}</span>}
      </div>
    </form>
  );
}
