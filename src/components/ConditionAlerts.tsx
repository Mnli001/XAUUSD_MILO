"use client";
import { useActionState, useState } from "react";
import { useT } from "./PrefsProvider";
import { createConditionAlertAction, deleteConditionAlertAction, type AlertState } from "@/lib/actions/alerts";

export type ConditionRow = { id: string; label: string; lastFired: string | null };

/** The "when this happens on the chart" half of the alerts card: pick a condition, a timeframe and (for RSI) a level. */
export function ConditionAlerts({ rows, max }: { rows: ConditionRow[]; max: number }) {
  const t = useT();
  const [state, action, pending] = useActionState<AlertState, FormData>(createConditionAlertAction, {});
  const [kind, setKind] = useState("rsi_below");
  const rsiKind = kind.startsWith("rsi_");
  const daily = kind.startsWith("prev_");
  const kinds: [string, string][] = [
    ["rsi_below", t("RSI доош орвол", "RSI falls below")],
    ["rsi_above", t("RSI дээш гарвал", "RSI rises above")],
    ["ema_cross_up", t("EMA50 EMA200-г дээш огтолбол", "EMA50 crosses above EMA200")],
    ["ema_cross_down", t("EMA50 EMA200-г доош огтолбол", "EMA50 crosses below EMA200")],
    ["prev_high_break", t("Өчигдрийн high-аас дээш хаагдвал", "A close above yesterday's high")],
    ["prev_low_break", t("Өчигдрийн low-оос доош хаагдвал", "A close below yesterday's low")],
    ["prev_high_sweep", t("Өчигдрийн high-ийг sweep хийвэл", "Yesterday's high is swept")],
    ["prev_low_sweep", t("Өчигдрийн low-ийг sweep хийвэл", "Yesterday's low is swept")],
  ];
  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <h3 className="text-sm font-semibold text-zinc-200">{t("Нөхцөлөөр сэрэмжлүүлэх", "Alert on a chart condition")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("Лаа хаагдах бүрт шалгана. Нөхцөл шинээр биелэх бүрт мэдэгдэнэ, устгах хүртэл ажиллана.", "Checked on every closed bar. It notifies you each time the condition newly happens, until you delete it.")}</p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="cond-kind">{t("Нөхцөл", "Condition")}</label>
          <select id="cond-kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {!daily && (
          <div>
            <label className="label" htmlFor="cond-tf">{t("Хугацаа", "Timeframe")}</label>
            <select id="cond-tf" name="timeframe" className="input" defaultValue="1h">
              <option value="15min">M15</option><option value="1h">H1</option><option value="4h">H4</option>
            </select>
          </div>
        )}
        {rsiKind && (
          <div className="w-24">
            <label className="label" htmlFor="cond-value">{t("Түвшин", "Level")}</label>
            <input id="cond-value" name="value" className="input tabular-nums" type="number" min="5" max="95" step="1" required defaultValue={kind === "rsi_below" ? 30 : 70} key={kind} />
          </div>
        )}
        <button className="btn-ghost shrink-0" disabled={pending || rows.length >= max}>{t("Тавих", "Set")}</button>
      </form>
      {state.ok && <p role="status" className="mt-2 text-sm text-emerald-400">{state.ok}</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-red-300">{state.error}</p>}
      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-800/80" aria-label={t("Нөхцөлт сэрэмжлүүлэг", "Condition alerts")}>
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 text-sm text-zinc-100">{r.label}{r.lastFired && <span className="ms-2 text-xs text-zinc-500">{t("сүүлд", "last")} {r.lastFired}</span>}</span>
              <form action={deleteConditionAlertAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-red-300" aria-label={t(`“${r.label}” сэрэмжлүүлгийг устгах`, `Delete “${r.label}”`)}>{t("Устгах", "Delete")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
