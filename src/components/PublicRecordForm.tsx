"use client";
import { useActionState } from "react";
import { setPublicRecordAction, type AdminState } from "@/lib/actions/admin";
import { useT } from "./PrefsProvider";

export type RecordAccountOption = { login: string; label: string; mode: string | null };

/** Choose which of the admin's own robot accounts the landing page shows, and from which day. */
export function PublicRecordForm({ accounts, today, current }: { accounts: RecordAccountOption[]; today: string; current?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<AdminState, FormData>(setPublicRecordAction, {});
  const modeWord = (m: string | null) => (m === "REAL" ? t("Real данс", "Real account") : m ? t("Demo данс", "Demo account") : t("төрөл тодорхойгүй", "type unknown"));
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
      <div className="min-w-0">
        <label className="label" htmlFor="record-login">{t("Robot-ын данс", "Robot account")}</label>
        <select className="input" id="record-login" name="login" required defaultValue={current ?? accounts[0]?.login}>
          {accounts.map((a) => <option key={a.login} value={a.login}>{a.label} · {modeWord(a.mode)}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="record-since">{t("Эхлэх огноо (УБ)", "Start date (UB time)")}</label>
        <input className="input" id="record-since" name="since" type="date" defaultValue={today} max={today} required />
      </div>
      <button className="btn" disabled={pending}>{pending ? t("Хадгалж байна…", "Saving…") : t("Нийтэд харуулах", "Show publicly")}</button>
      {state.error && <p role="alert" className="text-sm text-red-400 sm:col-span-3">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-emerald-400 sm:col-span-3">{state.ok}</p>}
    </form>
  );
}
