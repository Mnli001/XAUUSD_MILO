import { MN_VIEWER, type Viewer } from "@/lib/viewer";

/** Cumulative P&L as a simple SVG line. */
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
  return (
    <svg viewBox={`0 -6 ${W} ${H + 12}`} className="h-48 w-full" role="img" aria-label={t(`Нийт P&L-ийн муруй, эцсийн утга ${last.toFixed(2)} доллар`, `Cumulative P&L curve, final value ${last.toFixed(2)} dollars`)} preserveAspectRatio="none">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-zinc-700)" strokeDasharray="4 4" />
      <polyline fill="none" strokeWidth="2" stroke={last >= 0 ? "var(--color-emerald-500)" : "var(--color-red-500)"} points={values.map((value, i) => `${x(i)},${y(value)}`).join(" ")} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
