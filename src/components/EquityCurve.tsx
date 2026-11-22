/** Cumulative P&L as a simple SVG line. */
export function EquityCurve({ points }: { points: { value: number }[] }) {
  const values = [0, ...points.map((p) => p.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 600, H = 180;
  const x = (i: number) => (i / Math.max(values.length - 1, 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;
  const last = values.at(-1)!;
  return (
    <svg viewBox={`0 -6 ${W} ${H + 12}`} className="h-48 w-full" role="img" aria-label={`Нийт P&L-ийн муруй, эцсийн утга ${last.toFixed(2)} доллар`} preserveAspectRatio="none">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#3d382c" strokeDasharray="4 4" />
      <polyline fill="none" strokeWidth="2" stroke={last >= 0 ? "#2ea878" : "#d44b3f"} points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
