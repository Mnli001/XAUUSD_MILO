"use client";
import { useActionState, useState } from "react";
import { useT } from "./PrefsProvider";
import { saveRiskAction, type RiskState } from "@/lib/actions/risk";

type Bar = { used: number; limit: number; pct: number };
export type RiskView = {
  login: string;
  rule: { accountSize: number; dailyLossPct: number; maxLossPct: number; profitTargetPct: number | null; closeOnBreach: boolean } | null;
  reading: { daily: Bar; max: Bar; target: { made: number; goal: number; pct: number } | null } | null;
  breach: "RISK_DAILY" | "RISK_MAX" | null;
};
type Preset = { id: string; name: string; dailyLossPct: number; maxLossPct: number; profitTargetPct: number | null };

const usd = (x: number) => `$${Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function Meter({ label, bar, sign = "−" }: { label: string; bar: Bar; sign?: string }) {
  const tone = bar.pct >= 100 ? "bg-red-400" : bar.pct >= 80 ? "bg-amber-400" : "bg-emerald-400/80";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-zinc-300">{label}</span><span className="tabular-nums text-zinc-100">{sign}{usd(bar.used)} <span className="text-zinc-500">/ {usd(bar.limit)} · {bar.pct}%</span></span></div>
      <div className="mt-1.5 h-2 rounded-full bg-zinc-800" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, bar.pct)}><div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, bar.pct)}%` }} /></div>
    </div>
  );
}

/** The risk manager on the Bot page: the limits and, once the robot reports, where the account stands against them. */
export function RiskCard({ view, presets }: { view: RiskView; presets: Preset[] }) {
  const t = useT();
  const [state, action, pending] = useActionState<RiskState, FormData>(saveRiskAction, {});
  const r = view.rule;
  const [vals, setVals] = useState({ daily: String(r?.dailyLossPct ?? 5), max: String(r?.maxLossPct ?? 10), target: r?.profitTargetPct == null ? "" : String(r.profitTargetPct) });
  return (
    <section id="risk" className="card scroll-mt-24" aria-labelledby="risk-h">
      <h2 id="risk-h" className="card-title">{t("Эрсдэлийн менежер", "Risk manager")}</h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Prop firm шиг өдрийн болон нийт алдагдлын хязгаар тавина. 80%-д хүрэхэд сануулна, 100%-д хүрэхэд робот зогсоно. Хэмжилт нь дансны equity (нээлттэй арилжааны ашиг/алдагдал орсон) дээр.", "Set a daily and an overall loss limit like a prop firm. At 80% you are warned, at 100% the robot stops. Measured on the account's equity (open trades included).")}</p>
      {view.breach && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{view.breach === "RISK_DAILY" ? t("Өнөөдрийн алдагдлын хязгаарт хүрсэн: робот маргааш хүртэл зогсоно.", "Today's loss limit was reached: the robot stays off until tomorrow.") : t("Нийт алдагдлын хязгаарт хүрсэн: дүрмээ шинэчилтэл робот асахгүй.", "The overall loss limit was reached: the robot stays off until you update the rules.")}</p>}
      {view.reading && (
        <div className="mt-4 space-y-3">
          <Meter label={t("Өнөөдрийн алдагдал", "Today's loss")} bar={view.reading.daily} />
          <Meter label={t("Нийт алдагдал", "Overall loss")} bar={view.reading.max} />
          {view.reading.target && <Meter label={t("Ашгийн зорилт", "Profit target")} bar={{ used: view.reading.target.made, limit: view.reading.target.goal, pct: view.reading.target.pct }} sign={view.reading.target.made < 0 ? "−" : "+"} />}
        </div>
      )}
      <form action={action} className="mt-5 space-y-3">
        <input type="hidden" name="login" value={view.login} />
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Бэлэн тохиргоо", "Presets")}>
          {presets.map((p) => (
            <button key={p.id} type="button" className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500" onClick={() => setVals({ daily: String(p.dailyLossPct), max: String(p.maxLossPct), target: p.profitTargetPct === null ? "" : String(p.profitTargetPct) })}>{p.name}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className="label" htmlFor="risk-size">{t("Дансны хэмжээ ($)", "Account size ($)")}</label><input id="risk-size" name="accountSize" className="input tabular-nums" type="number" min="1" step="any" required defaultValue={r?.accountSize ?? ""} /></div>
          <div><label className="label" htmlFor="risk-daily">{t("Өдрийн хязгаар (%)", "Daily limit (%)")}</label><input id="risk-daily" name="dailyLossPct" className="input tabular-nums" type="number" min="0.1" max="50" step="0.1" required value={vals.daily} onChange={(e) => setVals({ ...vals, daily: e.target.value })} /></div>
          <div><label className="label" htmlFor="risk-max">{t("Нийт хязгаар (%)", "Overall limit (%)")}</label><input id="risk-max" name="maxLossPct" className="input tabular-nums" type="number" min="0.1" max="100" step="0.1" required value={vals.max} onChange={(e) => setVals({ ...vals, max: e.target.value })} /></div>
          <div><label className="label" htmlFor="risk-target">{t("Ашгийн зорилт (%)", "Profit target (%)")}</label><input id="risk-target" name="profitTargetPct" className="input tabular-nums" type="number" min="0.1" step="0.1" placeholder={t("заавал биш", "optional")} value={vals.target} onChange={(e) => setVals({ ...vals, target: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" name="closeOnBreach" defaultChecked={r?.closeOnBreach ?? true} />{t("Хязгаарт хүрэхэд роботын нээлттэй арилжааг хаах", "Close the robot's open trades when a limit is reached")}</label>
        <div className="flex flex-wrap gap-3">
          <button className="btn" disabled={pending}>{t("Хадгалах", "Save")}</button>
          {r && <button className="btn-ghost text-red-300" name="remove" value="1" formNoValidate disabled={pending}>{t("Хязгаарыг арилгах", "Remove limits")}</button>}
        </div>
        {state.ok && <p role="status" className="text-sm text-emerald-400">{state.ok}</p>}
        {state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      </form>
    </section>
  );
}
