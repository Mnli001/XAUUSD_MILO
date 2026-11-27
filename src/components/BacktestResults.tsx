"use client";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useT } from "./PrefsProvider";
import { HERO_RISK, finalBalance, riskCurve, signedPct, underwater, usd, type BacktestCurves } from "@/lib/backtestCurves";

const W = 600, EQ_H = 200, DD_TOP = 216, DD_H = 64, H = DD_TOP + DD_H;

/** 1, 2 or 5 × 10ⁿ: a round step for about `parts` gridlines over `span`. */
function niceStep(span: number, parts: number): number {
  const raw = span / parts;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}
const kUsd = (v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: v % 1000 === 0 ? 0 : 1 })}k` : `$${v}`);

/**
 * "If you had followed this system since 2019": a risk per trade to choose, the month-end balance from $1,500 as a gold
 * line, the fall from each high below it on a scale shared by every risk (so a bigger risk visibly dips deeper), and the
 * figures for that risk. Every number comes from the backtest file; nothing is computed beyond the underwater line.
 */
export function BacktestResults({ curves, initialRisk = HERO_RISK }: { curves: BacktestCurves; initialRisk?: number }) {
  const t = useT();
  const id = useId();
  const [risk, setRisk] = useState(initialRisk);
  const [hover, setHover] = useState<number | null>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const c = riskCurve(risk, curves);
  const pts = c.monthly;
  const final = finalBalance(c);
  const ddScale = useMemo(() => Math.ceil(Math.max(...curves.risks.map((r) => r.maxDD)) / 5) * 5, [curves]);
  const maxRiskDD = Math.max(...curves.risks.map((r) => r.maxDD));

  const lo = Math.min(curves.start, ...pts.map((p) => p.eq));
  const hi = Math.max(...pts.map((p) => p.eq));
  // The axis starts just under the lowest balance; the gridlines sit on round multiples of the step.
  const floor = Math.floor(lo / 500) * 500;
  const step = niceStep(hi - floor, 3);
  const top = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = Math.ceil(floor / step) * step; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  const x = (i: number) => (i / Math.max(pts.length - 1, 1)) * W;
  const y = (v: number) => EQ_H - ((v - floor) / (top - floor || 1)) * EQ_H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.eq).toFixed(1)}`).join(" ");
  const dd = underwater(pts);
  const ddY = (v: number) => DD_TOP + (Math.min(-v, ddScale) / ddScale) * DD_H;
  const ddPath = `M0 ${DD_TOP} ${dd.map((v, i) => `L${x(i).toFixed(1)} ${ddY(v).toFixed(1)}`).join(" ")} L${W} ${DD_TOP} Z`;
  const years = pts.map((p, i) => [p.m, i] as const).filter(([m]) => m.endsWith("-01"));
  const pctY = (py: number) => `${(py / H) * 100}%`;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = curves.risks.length;
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setRisk(curves.risks[next].risk);
    radios.current[next]?.focus();
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    setHover(Math.round(f * (pts.length - 1)));
  };
  const tag = (r: number) => (r === HERO_RISK ? t("тэнцвэртэй", "balanced") : r === curves.risks[0].risk ? t("болгоомжтой", "careful") : r === curves.risks.at(-1)!.risk ? t("түрэмгий", "aggressive") : "");
  const h = hover === null ? null : { p: pts[hover], dd: dd[hover] };

  return (
    <div className="space-y-6">
      <div>
        <p id={`${id}-risk`} className="label">{t("Арилжаа бүрт эрсдэлд оруулах хэмжээ (дансны %)", "Risk per trade (% of the account)")}</p>
        <div role="radiogroup" aria-labelledby={`${id}-risk`} className="grid grid-cols-5 gap-1.5 rounded-[18px] border p-1.5" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
          {curves.risks.map((r, i) => {
            const on = r.risk === risk;
            return (
              <button
                key={r.risk}
                ref={(el) => { radios.current[i] = el; }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setRisk(r.risk)}
                onKeyDown={(e) => onKey(e, i)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-[13px] px-1 text-[15px] font-semibold tabular-nums transition-colors duration-150 ${on ? "text-[var(--accent-fg)]" : "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50"}`}
                style={on ? { background: "var(--accent-bg)", boxShadow: "0 8px 20px -12px rgb(217 181 102 / 0.7)" } : undefined}
              >
                <span>{r.risk}%</span>
                {tag(r.risk) && <span className={`hidden text-[10px] leading-tight font-medium sm:block ${on ? "opacity-80" : "text-zinc-500"}`}>{tag(r.risk)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="min-w-0">
          <span className="mb-1.5 block text-sm text-zinc-400">{t(`${usd(curves.start)}-оос эхэлсэн данс`, `An account that started with ${usd(curves.start)}`)}</span>
          <span className="font-display block text-[44px] leading-none text-zinc-50 sm:text-[56px]" data-testid="final-balance">{usd(final)}</span>
        </p>
        <p className="text-right">
          <span className="block text-sm text-zinc-400">{t("Нийт өсөлт", "Total growth")}</span>
          <span className="block text-2xl font-semibold text-amber-300 tabular-nums">{signedPct(c.finalPct, 0)}</span>
        </p>
      </div>

      <figure className="m-0">
        <div className="relative touch-pan-y select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-64 w-full sm:h-72" role="img"
            aria-label={t(`${usd(curves.start)}-оос ${usd(final)} хүрсэн балансын муруй, ${risk}% эрсдэлтэй. Хамгийн их уналт −${c.maxDD}%.`, `Balance curve from ${usd(curves.start)} to ${usd(final)} at ${risk}% risk. Largest fall −${c.maxDD}%.`)}>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-amber-400)" stopOpacity="0.28" />
                <stop offset="1" stopColor="var(--color-amber-400)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((v) => <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />)}
            {years.map(([m, i]) => <line key={m} x1={x(i)} x2={x(i)} y1="0" y2={H} stroke="var(--chart-grid)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />)}
            <line x1="0" x2={W} y1={y(curves.start)} y2={y(curves.start)} stroke="var(--color-zinc-600)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <g key={risk} className="draw-line">
              <path d={`${line} L${W} ${EQ_H} L0 ${EQ_H} Z`} fill={`url(#${id}-fill)`} />
              <path d={line} fill="none" stroke="var(--color-amber-300)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
            {/* The fall from each high, on one scale for every risk. */}
            <rect x="0" y={DD_TOP} width={W} height={DD_H} fill="var(--glass-inset)" />
            <path d={ddPath} fill="var(--color-red-400)" fillOpacity="0.35" stroke="var(--color-red-400)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2={W} y1={ddY(-c.maxDD)} y2={ddY(-c.maxDD)} stroke="var(--color-red-400)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--color-zinc-400)" vectorEffect="non-scaling-stroke" />}
          </svg>
          {ticks.map((v) => (
            <span key={v} aria-hidden className="pointer-events-none absolute left-1 -translate-y-full pb-0.5 text-[10px] text-zinc-500 tabular-nums" style={{ top: pctY(y(v)) }}>{kUsd(v)}</span>
          ))}
          <span aria-hidden className="pointer-events-none absolute left-1 pt-1 text-[10px] font-medium text-zinc-300" style={{ top: pctY(DD_TOP + DD_H * 0.45) }}>{t("Уналт (сарын эцсээр)", "Fall from high (month end)")}</span>
          <span aria-hidden className="pointer-events-none absolute right-1 -translate-y-full pb-0.5 text-[10px] font-semibold text-red-300 tabular-nums" style={{ top: pctY(ddY(-c.maxDD)) }}>{t(`хамгийн их −${c.maxDD}%`, `largest −${c.maxDD}%`)}</span>
          <span aria-hidden className="pointer-events-none absolute right-1 text-[10px] text-zinc-500 tabular-nums" style={{ top: pctY(H - 14) }}>−{ddScale}%</span>
          {h && (
            <span aria-hidden className="pointer-events-none absolute top-1 rounded-lg border px-2 py-1 text-[11px] whitespace-nowrap text-zinc-200 tabular-nums" style={{ left: `${(hover! / (pts.length - 1)) * 100}%`, transform: hover! > pts.length / 2 ? "translateX(calc(-100% - 6px))" : "translateX(6px)", borderColor: "var(--hairline)", background: "var(--glass-menu)" }}>
              {h.p.m} · <strong className="font-semibold text-zinc-50">{usd(h.p.eq)}</strong>{h.dd < -0.05 ? ` · ${signedPct(h.dd, 1)}` : ""}
            </span>
          )}
        </div>
        <div aria-hidden className="relative mt-1 h-4 text-[10px] text-zinc-500 tabular-nums">
          {years.map(([m, i], k) => (
            <span key={m} className={`absolute ${i === 0 ? "" : "-translate-x-1/2"} ${k % 2 ? "max-sm:hidden" : ""}`} style={{ left: `${(i / (pts.length - 1)) * 100}%` }}>{m.slice(0, 4)}</span>
          ))}
        </div>
      </figure>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-inset p-4">
          <dt className="text-xs font-semibold text-zinc-400">{t("Жилийн дундаж өсөлт (CAGR)", "Yearly average (CAGR)")}</dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-50 tabular-nums">{signedPct(c.cagr)}</dd>
        </div>
        <div className="glass-inset p-4">
          <dt className="text-xs font-semibold text-zinc-400">{t("Хамгийн их уналт", "Largest drawdown")}</dt>
          <dd className="mt-1 text-xl font-semibold text-red-300 tabular-nums">−{c.maxDD.toFixed(2)}%</dd>
          <dd aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"><span className="block h-full rounded-full bg-red-400 transition-[width] duration-300" style={{ width: `${(c.maxDD / maxRiskDD) * 100}%` }} /></dd>
        </div>
        <div className="glass-inset p-4">
          <dt className="text-xs font-semibold text-zinc-400">{t("Хамгийн муу сар", "Worst month")}</dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-50 tabular-nums">{signedPct(c.worstMonth)}</dd>
        </div>
        <div className="glass-inset p-4">
          <dt className="text-xs font-semibold text-zinc-400">{t("Хамгийн сайн сар", "Best month")}</dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-50 tabular-nums">{signedPct(c.bestMonth)}</dd>
        </div>
      </dl>

      <p className="text-sm leading-relaxed text-zinc-400" aria-live="polite">
        {t(
          `${risk}% эрсдэлтэй бол ${usd(curves.start)} → ${usd(final)} болсон ч замдаа дансны ${c.maxDD.toFixed(1)}% хүртэл буурч байсан. Эрсдэл өсөхөд ашиг ч, уналт ч хамт томорно.`,
          `At ${risk}% risk ${usd(curves.start)} became ${usd(final)}, but on the way the account fell as much as ${c.maxDD.toFixed(1)}%. Raise the risk and the profit and the falls grow together.`,
        )}
      </p>
    </div>
  );
}
