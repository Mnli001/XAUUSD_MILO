/** Comparing a release's actual figure with its forecast. No database access, so pages and components can use it. */
const lead = (s: string | null) => { const m = s?.replace(/,/g, "").match(/[-+−]?\d+(\.\d+)?/); return m ? Number(m[0].replace("−", "-")) : null; };
/** Whether the actual came in above, below or in line with the forecast; null when either is missing. */
export function surprise(actual: string | null, forecast: string | null): "above" | "below" | "inline" | null {
  const a = lead(actual), f = lead(forecast);
  if (a === null || f === null) return null;
  return Math.abs(a - f) < 1e-9 ? "inline" : a > f ? "above" : "below";
}

/** Gold's average move 60 minutes after releases that beat and that missed the forecast. */
export function surpriseStats(rows: { forecast: string | null; actual: string | null; move60: number | null }[]) {
  const group = (want: "above" | "below") => {
    const moves = rows.filter((r) => r.move60 !== null && Number.isFinite(r.move60) && surprise(r.actual, r.forecast) === want).map((r) => r.move60!);
    return { n: moves.length, avg: moves.length ? Math.round((moves.reduce((s, x) => s + x, 0) / moves.length) * 100) / 100 : null, upPct: moves.length ? Math.round((moves.filter((x) => x > 0).length / moves.length) * 100) : null };
  };
  return { above: group("above"), below: group("below") };
}

