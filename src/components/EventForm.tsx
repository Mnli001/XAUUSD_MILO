"use client";
import { useActionState } from "react";
import { saveEventAction, type AdminState } from "@/lib/actions/admin";
import { useT } from "./PrefsProvider";

export type EventFormValues = { id?: string; type: string; title: string; ubDate: string; ubTime: string; impact: string; forecast: string; previous: string; actual: string };

export function EventForm({ initial, types }: { initial: EventFormValues; types: { type: string; title: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState<AdminState, FormData>(saveEventAction, {});
  const text = (name: keyof EventFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={`${initial.id ?? "new"}-${name}`}>{label}</label><input className="input" id={`${initial.id ?? "new"}-${name}`} name={name} defaultValue={initial[name]} {...props} /></div>
  );
  return (
    <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {text("type", t("Төрөл (жишээ: FOMC)", "Type (e.g. FOMC)"), { required: true, list: "event-types", maxLength: 30 })}
      <datalist id="event-types">{types.map((t) => <option key={t.type} value={t.type}>{t.title}</option>)}</datalist>
      <div className="col-span-2">{text("title", t("Гарчиг", "Title"), { required: true, maxLength: 120 })}</div>
      <div>
        <label className="label" htmlFor={`${initial.id ?? "new"}-impact`}>{t("Нөлөөлөл", "Impact")}</label>
        <select className="input" id={`${initial.id ?? "new"}-impact`} name="impact" defaultValue={initial.impact}>
          <option value="HIGH">{t("Өндөр", "High")}</option><option value="MEDIUM">{t("Дунд", "Medium")}</option><option value="LOW">{t("Бага", "Low")}</option>
        </select>
      </div>
      {text("ubDate", t("Огноо (УБ)", "Date (UB time)"), { type: "date", required: true })}
      {text("ubTime", t("Цаг (УБ)", "Time (UB time)"), { type: "time", required: true })}
      {text("forecast", t("Таамаг", "Forecast"), { maxLength: 40 })}
      {text("previous", t("Өмнөх", "Previous"), { maxLength: 40 })}
      {text("actual", t("Бодит", "Actual"), { maxLength: 40 })}
      <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-3 sm:items-end">
        <button className="btn" disabled={pending}>{pending ? t("Хадгалж байна…", "Saving…") : initial.id ? t("Хадгалах", "Save") : t("Мэдээ нэмэх", "Add release")}</button>
        {state.error && <span role="alert" className="text-sm text-red-400">{state.error}</span>}
        {state.ok && <span role="status" className="text-sm text-emerald-400">{state.ok}</span>}
      </div>
    </form>
  );
}
