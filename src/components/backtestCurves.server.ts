import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CURVES, type BacktestCurves } from "@/lib/backtestCurves";

/**
 * The backtest file as it is on disk now, read when a page renders, so a regenerated src/data/backtest-curves.json
 * (scripts/export-equity-curves.ts) shows without a rebuild. Optional fields a newer export may carry (`model`,
 * `assumptions`) are passed through untouched for BacktestFacts to print. Anything unreadable falls back to the copy
 * bundled at build time. Server only: it touches the file system.
 */
export type CurvesFile = BacktestCurves & { model?: unknown; assumptions?: unknown };

const FILE = path.join(process.cwd(), "src", "data", "backtest-curves.json");
let cache: { mtime: number; data: CurvesFile } | null = null;

const usable = (x: unknown): x is CurvesFile => {
  const c = x as Partial<BacktestCurves> | null;
  return !!c && Array.isArray(c.risks) && c.risks.length > 0 && Array.isArray(c.years) && !!c.stats && typeof c.start === "number" && c.risks.every((r) => Array.isArray(r.monthly) && r.monthly.length > 0);
};

export async function loadCurves(): Promise<CurvesFile> {
  try {
    const s = await stat(FILE);
    if (cache && cache.mtime === s.mtimeMs) return cache.data;
    const data: unknown = JSON.parse(await readFile(FILE, "utf8"));
    if (!usable(data)) return CURVES;
    cache = { mtime: s.mtimeMs, data };
    return data;
  } catch {
    return CURVES;
  }
}
