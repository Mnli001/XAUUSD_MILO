import type { T } from "@/lib/i18n";
import { CURVES, HERO_RISK, finalBalance, riskCurve, rrLabel, rrRange, signedPct, signedR, spanLabel, usd, type BacktestCurves } from "@/lib/backtestCurves";
import { Dir } from "./Timetable";

/** The one line every backtest figure carries: what it is, where from, and that the past is not a promise. */
export function BacktestNote({ t, c = CURVES, className = "" }: { t: T; c?: BacktestCurves; className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-zinc-500 ${className}`}>
      <span className="font-semibold text-zinc-400">{t("Түүхэн датан дээрх туршилт (backtest)", "A test on historical data (backtest)")}</span>
      {" · "}{t(`MT5 брокерын XAUUSD ${spanLabel(c)}, spread $${c.spread.toFixed(2)}, хаагдсан арилжаагаар. Өнгөрсөн үр дүн ирээдүйн ашгийг баталгаажуулахгүй.`, `MT5 broker XAUUSD ${spanLabel(c)}, $${c.spread.toFixed(2)} spread, on closed trades. Past results do not guarantee future profit.`)}
    </p>
  );
}

/** R won or lost in each calendar year, as bars around a zero rule. The sign is printed, not only coloured. */
export function YearBars({ t, c = CURVES }: { t: T; c?: BacktestCurves }) {
  // Zero sits where it leaves room for the deepest losing year on the left and the best year on the right.
  const neg = Math.max(0, ...c.years.map((y) => -y.r)), pos = Math.max(0, ...c.years.map((y) => y.r));
  const span = neg + pos || 1;
  const zero = (neg / span) * 100;
  return (
    <ul className="space-y-2.5" aria-label={t("Жил бүрийн үр дүн, R-ээр", "Result by year, in R")}>
      {c.years.map((y) => {
        const up = y.r >= 0;
        const thin = y.trades < 20;
        return (
          <li key={y.year} className="grid grid-cols-[3rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
            <span className="font-semibold text-zinc-300 tabular-nums">{y.year}</span>
            <span className="relative h-6" aria-hidden>
              <span className="absolute inset-y-0 w-px" style={{ left: `${zero}%`, background: "var(--color-zinc-600)" }} />
              <span
                className={`absolute inset-y-1 ${up ? "rounded-r-md bg-amber-400/80" : "rounded-l-md bg-red-400/70"}`}
                style={{ [up ? "left" : "right"]: up ? `${zero}%` : `${100 - zero}%`, width: `${(Math.abs(y.r) / span) * 100}%`, minWidth: 3 }}
              />
            </span>
            <span className={`text-right font-semibold tabular-nums ${up ? "text-zinc-50" : "text-red-300"}`}>
              <Dir d={up ? 1 : -1} className="mr-1" />{signedR(y.r)}
            </span>
            <span className="col-span-3 -mt-1.5 pl-[3.75rem] text-[11px] text-zinc-500 tabular-nums">
              {thin
                ? t(`${y.trades} арилжаа · өгөгдөл дутуу жил`, `${y.trades} trades · a year with missing data`)
                : t(`${y.trades} арилжаа · ${Math.round(y.winRate)}% ашигтай${y.year === Number(c.generatedAt.slice(0, 4)) ? " · он дуусаагүй" : ""}`, `${y.trades} trades · ${Math.round(y.winRate)}% in profit${y.year === Number(c.generatedAt.slice(0, 4)) ? " · year not over" : ""}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Four facts about how the system trades, the same at every risk. */
export function KeyStats({ t, c = CURVES }: { t: T; c?: BacktestCurves }) {
  const s = c.stats;
  const [lo, hi] = rrRange();
  const items: [string, string, string][] = [
    [t("Долоо хоногт", "Trades a week"), `~${s.perWeek.toFixed(1)}`, t(`нийт ${s.trades} арилжаа`, `${s.trades} trades in all`)],
    [t("Ашигтай арилжаа", "Trades in profit"), `${(Math.round(s.winRate * 10 + 1e-6) / 10).toFixed(1)}%`, t("бараг тал нь", "about half")],
    ["R:R", rrLabel(), t(`target нь stop-оос ${lo}–${hi} дахин их`, `targets ${lo}–${hi}× the stop`)],
    ["Profit factor", s.profitFactor.toFixed(2), t(`дунджаар +${s.avgR.toFixed(2)}R / арилжаа`, `+${s.avgR.toFixed(2)}R a trade on average`)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map(([label, value, sub]) => (
        <div key={label} className="glass-inset p-4 sm:p-5">
          <dt className="text-xs font-semibold text-zinc-400">{label}</dt>
          <dd className="font-display mt-1.5 text-[28px] leading-none whitespace-nowrap text-zinc-50 tabular-nums sm:text-[32px]">{value}</dd>
          <dd className="mt-1.5 text-xs text-zinc-500">{sub}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The headline proof: "$1,500 → $6,494 · 2019–2026 · 1.5% risk", with the drawdown it took to get there. */
export function ProofLine({ t, c = CURVES, risk = HERO_RISK, size = "lg" }: { t: T; c?: BacktestCurves; risk?: number; size?: "lg" | "sm" }) {
  const r = riskCurve(risk, c);
  const big = size === "lg";
  return (
    <p className="min-w-0">
      <span className={`font-display block leading-none text-zinc-50 ${big ? "text-[clamp(2.2rem,7vw,3.4rem)]" : "text-[30px] sm:text-[36px]"}`}>
        {usd(c.start)} <span aria-hidden className="text-amber-400">→</span><span className="sr-only">{t("-аас", "to")}</span> <span className="gold-text">{usd(finalBalance(r))}</span>
      </span>
      <span className={`mt-2 block text-zinc-300 tabular-nums ${big ? "text-base sm:text-lg" : "text-sm"}`}>
        {t(`${spanLabel(c)} · арилжаа бүрт ${risk}% эрсдэлтэй · ${signedPct(r.finalPct, 0)} · хамгийн их уналт −${r.maxDD.toFixed(1)}%`, `${spanLabel(c)} · ${risk}% risk per trade · ${signedPct(r.finalPct, 0)} · largest fall −${r.maxDD.toFixed(1)}%`)}
      </span>
    </p>
  );
}

/** Every risk on one line each: what it made and the fall it took. For the plans page. */
export function RiskLadder({ t, c = CURVES }: { t: T; c?: BacktestCurves }) {
  return (
    <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-5" aria-label={t("Эрсдэл бүрийн үр дүн", "Result at each risk")}>
      {c.risks.map((r) => (
        <li key={r.risk} className={`glass-inset px-3 py-2.5 text-sm ${r.risk === HERO_RISK ? "glass-tile-on" : ""}`}>
          <span className="block text-xs font-semibold text-zinc-400">{t(`${r.risk}% эрсдэл`, `${r.risk}% risk`)}</span>
          <span className="block font-semibold text-zinc-50 tabular-nums">{usd(finalBalance(r))} <span className="text-amber-300">{signedPct(r.finalPct, 0)}</span></span>
          <span className="block text-xs text-red-300 tabular-nums">{t(`уналт −${r.maxDD.toFixed(1)}%`, `fall −${r.maxDD.toFixed(1)}%`)}</span>
        </li>
      ))}
    </ul>
  );
}
