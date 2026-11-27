"use client";
import { useState } from "react";
import { sessionLabel } from "@/lib/time";
import { useViewer } from "./PrefsProvider";
import { SESSIONS, sessionColor } from "./SessionLine";
import { Masked, UnlockLink } from "./Paywall";
import { Dir } from "./Timetable";
import { Icon } from "./TodayIcons";

/** One hour of the strip. `up`: the chance (%) the hour closes higher, null when the sample is too small. */
export type HourCell = { hour: number; label: string; session: string; up: number | null; n: number; cond: boolean; avg: number | null; news: string | null };

/** "21:00" → "21"; a clock with odd minutes (a :30 time zone) keeps them. */
const short = (label: string) => (label.endsWith(":00") ? label.slice(0, -3) : label);

/**
 * The next 24 hours as one row of cells, tinted by how likely the hour is to rise (green) or fall (red), with the
 * session underneath and a diamond over hours near a high-impact release. Pointing at (or tapping) a cell spells it
 * out in the line below. `locked`: the hours, sessions and releases stay; the odds never reach the page.
 */
export function HourStrip({ cells, locked = false }: { cells: HourCell[]; locked?: boolean }) {
  const { t, zone } = useViewer();
  const [sel, setSel] = useState(0);
  const c = cells[Math.min(sel, cells.length - 1)];
  const say = (x: HourCell) => (x.up === null ? t("дата хангалтгүй", "not enough data") : x.up >= 50 ? t(`${x.up}% өсөх`, `${x.up}% up`) : t(`${100 - x.up}% унах`, `${100 - x.up}% down`));
  return (
    <section className="card" aria-labelledby="hours-h">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Icon name="clock" className="h-[18px] w-[18px] text-amber-400" />
        <div className="min-w-0 flex-1">
          <h2 id="hours-h" className="text-base font-semibold text-zinc-100">{t("Дараагийн 24 цаг", "The next 24 hours")}</h2>
          <p className="text-xs text-zinc-500">{t("Цаг бүр өсөх ▲ эсвэл унах ▼ магадлал · сүүлийн 6 сарын ижил trend-тэй өдрөөр", "Each hour's chance to rise ▲ or fall ▼ · from the last 6 months' days with the same trend")}</p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-zinc-400 max-sm:hidden">
          {SESSIONS.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span aria-hidden className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />{sessionLabel(s.key, t)}</li>)}
          <li className="text-amber-300">◆ {t("Мэдээ", "Release")}</li>
        </ul>
      </div>

      <ol className="relative -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-[repeat(24,minmax(0,1fr))] lg:overflow-visible">
        {cells.map((x, i) => {
          const up = x.up !== null && x.up >= 50;
          const p = x.up === null ? null : up ? x.up : 100 - x.up;
          const tone = up ? "text-emerald-400" : "text-red-400";
          const bg = locked || p === null ? "var(--glass-inset)" : `color-mix(in srgb, var(${up ? "--color-emerald-400" : "--color-red-400"}) ${Math.round(5 + ((p - 50) / 50) * 42)}%, transparent)`;
          return (
            <li key={x.hour} className="min-w-[42px] shrink-0 lg:min-w-0">
              <span aria-hidden className="block h-4 text-center text-[10px] leading-4 text-amber-300" title={x.news ?? undefined}>{x.news ? "◆" : ""}</span>
              <button
                type="button"
                data-testid="hour-cell"
                aria-pressed={sel === i}
                aria-label={`${x.label} ${sessionLabel(x.session, t)}${locked ? "" : ` ${say(x)}`}${x.news ? ` · ${x.news}` : ""}`}
                onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => setSel(i)}
                className={`flex h-[74px] w-full flex-col items-center overflow-hidden rounded-xl border pt-2 transition-colors ${i === 0 ? "border-amber-300" : sel === i ? "border-zinc-400" : "border-transparent"}`}
                style={{ background: bg }}
              >
                <span data-testid="hour" className={`text-xs tabular-nums ${i === 0 ? "font-semibold text-amber-300" : "text-zinc-400"}`}>{short(x.label)}</span>
                {locked ? (
                  <span aria-hidden className="mt-1.5 text-xs text-zinc-500">•••</span>
                ) : p === null ? (
                  <span aria-hidden className="mt-1.5 text-xs text-zinc-500">—</span>
                ) : (
                  <span aria-hidden className={`mt-1 flex flex-col items-center text-[13px] leading-tight font-semibold tabular-nums ${tone}`}>{p}<Dir d={up ? 1 : -1} className="text-[9px]" /></span>
                )}
                <span aria-hidden className="mt-auto h-[3px] w-full" style={{ background: sessionColor(x.session) }} />
              </button>
            </li>
          );
        })}
      </ol>

      {c && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-400" aria-live="polite" data-testid="hour-detail">
          <span className={`font-semibold tabular-nums ${sel === 0 ? "text-amber-300" : "text-zinc-100"}`}>{c.label} {zone}{sel === 0 && ` · ${t("одоо", "now")}`}</span>
          <span>· {sessionLabel(c.session, t)}</span>
          {locked ? (
            <><span>·</span><Masked t={t} /><UnlockLink t={t} /></>
          ) : c.up === null ? (
            <span>· {t("Дата хангалтгүй", "Not enough data")}</span>
          ) : (
            <>
              <span className={`font-semibold ${c.up >= 50 ? "text-emerald-400" : "text-red-400"}`}>· {say(c)}</span>
              <span className="text-zinc-500">· n={c.n}{!c.cond ? t(" · бүх өдөр", " · all days") : ""}</span>
              {c.avg !== null && <span className="text-zinc-500">· {t("дундаж", "average")} ±${c.avg.toFixed(1)}</span>}
            </>
          )}
          {c.news && <span className="text-amber-300">· ◆ {c.news}</span>}
        </p>
      )}
    </section>
  );
}
