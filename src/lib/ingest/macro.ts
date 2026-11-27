import { sql } from "drizzle-orm";
import { db, schema } from "../db";

/**
 * The things that move gold, fetched once a day: from FRED the broad US dollar index (DTWEXBGS), the 10-year real
 * yield (DFII10, TIPS) and the 10-year nominal yield (DGS10); from the CFTC the weekly Commitments of Traders for
 * COMEX gold (legacy report, futures only): non-commercial (speculators') net position and open interest.
 */

export const FRED_SERIES = ["DTWEXBGS", "DFII10", "DGS10"] as const;
export const COT_GOLD_CODE = "088691"; // GOLD - COMMODITY EXCHANGE INC.
const COT_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const DAY = 864e5;

type Obs = { date: string; value: number };
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);

/** FRED's observations; "." marks a day with no value. */
export function parseFred(body: unknown): Obs[] {
  const obs = (body as { observations?: { date?: unknown; value?: unknown }[] } | null)?.observations;
  if (!Array.isArray(obs)) return [];
  return obs.flatMap((o) => {
    const v = Number(o.value);
    return isDate(o.date) && o.value !== "." && Number.isFinite(v) ? [{ date: o.date.slice(0, 10), value: v }] : [];
  });
}

/** The CFTC rows: speculators' net (long minus short) and open interest, by report date. */
export function parseCot(body: unknown): { date: string; net: number; oi: number }[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((r: Record<string, unknown>) => {
    const long = Number(r.noncomm_positions_long_all), short = Number(r.noncomm_positions_short_all), oi = Number(r.open_interest_all);
    const date = r.report_date_as_yyyy_mm_dd;
    return isDate(date) && [long, short, oi].every(Number.isFinite) ? [{ date: date.slice(0, 10), net: long - short, oi }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function store(series: string, rows: Obs[]): Promise<number> {
  if (!rows.length) return 0;
  await db.insert(schema.macroSeries).values(rows.map((r) => ({ series, ...r })))
    .onConflictDoUpdate({ target: [schema.macroSeries.series, schema.macroSeries.date], set: { value: sql`excluded.value` } });
  return rows.length;
}

/** Fetches every source; one that fails is named in `failed` and the rest still go in. */
export async function ingestMacro(fredKey: string | undefined, now: Date, days = 400): Promise<{ stored: number; failed: string[] }> {
  const failed: string[] = [];
  let stored = 0;
  const start = new Date(now.getTime() - days * DAY).toISOString().slice(0, 10);
  if (fredKey) {
    for (const id of FRED_SERIES) {
      const q = new URLSearchParams({ series_id: id, api_key: fredKey, file_type: "json", observation_start: start });
      try { stored += await store(id, parseFred(await getJson(`https://api.stlouisfed.org/fred/series/observations?${q}`))); }
      catch (e) { failed.push(id); console.warn(`[macro] ${id} failed: ${e instanceof Error ? e.message : e}`); }
    }
  }
  const q = new URLSearchParams({ cftc_contract_market_code: COT_GOLD_CODE, $order: "report_date_as_yyyy_mm_dd DESC", $limit: String(Math.ceil(days / 7) + 4) });
  try {
    const cot = parseCot(await getJson(`${COT_URL}?${q}`));
    stored += await store("COT_NC_NET", cot.map((r) => ({ date: r.date, value: r.net })));
    stored += await store("COT_OI", cot.map((r) => ({ date: r.date, value: r.oi })));
  } catch (e) { failed.push("COT"); console.warn(`[macro] COT failed: ${e instanceof Error ? e.message : e}`); }
  return { stored, failed };
}
