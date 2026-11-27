import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { Dir } from "./Timetable";

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cumulative P&L drawn as one line along a ruled track: the zero rule dashed, the line coloured by
 * where it ends (up or down, with the signed figure beside it), and the last point as a station.
 */
export function EquityCurve({ points, v = MN_VIEWER }: { points: { value: number }[]; v?: Viewer }) {
  const { t } = v;
  const values = [0, ...points.map((p) => p.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 600, H = 180;
  const x = (i: number) => (i / Math.max(values.length - 1, 1)) * W;
  const y = (value: number) => H - ((value - min) / span) * H;
  const last = values.at(-1)!;
  const up = last >= 0;
  const color = up ? "var(--color-emerald-500)" : "var(--color-red-500)";
  const line = values.map((value, i) => `${x(i)},${y(value)}`).join(" ");
  const pct = (py: number) => `${((py + 6) / (H + 12)) * 100}%`; // position inside the padded viewBox
  return (
    <figure className="m-0">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs text-zinc-500">
        <span className="flex flex-wrap gap-x-2 tabular-nums"><span className="whitespace-nowrap">{t("Дээд", "High")} {signed(max)}</span><span className="whitespace-nowrap">{t("Доод", "Low")} {signed(min)}</span></span>
        <span className={`text-base font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>{last !== 0 && <Dir d={last} className="mr-1" />}{signed(last)}</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 -6 ${W} ${H + 12}`} className="block h-48 w-full" role="img" aria-label={t(`Нийт P&L-ийн муруй, эцсийн утга ${last.toFixed(2)} доллар`, `Cumulative P&L curve, final value ${last.toFixed(2)} dollars`)} preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />)}
          <polygon points={`0,${y(0)} ${line} ${W},${y(0)}`} fill={color} fillOpacity="0.1" />
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-zinc-600)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <polyline fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" stroke={color} points={line} vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden className={`pointer-events-none absolute left-1 text-xs text-zinc-500 ${y(0) < H * 0.15 ? "pt-0.5" : "-translate-y-full pb-0.5"}`} style={{ top: pct(y(0)) }}>$0</span>
        <span aria-hidden className="absolute h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-zinc-900" style={{ left: "100%", top: pct(y(last)), borderColor: color, marginLeft: -7 }} />
      </div>
    </figure>
  );
}
