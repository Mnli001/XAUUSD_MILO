/** The broker's candles exported by mt5/tester/XauExport.mq5, shifted from server time to UTC. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Candle } from "../src/lib/analysis/indicators";

const FILES = path.join(homedir(), "AppData", "Roaming", "MetaQuotes", "Terminal", "Common", "Files");
const H = 36e5;

/** Last Sunday of a month, 01:00 UTC: when EU clocks change. */
const lastSunday = (y: number, m: number) => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
/** Second Sunday of March / first Sunday of November (US), 07:00 UTC. */
const usStart = (y: number) => { const d = new Date(Date.UTC(y, 2, 1, 7)); d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7) + 7); return d.getTime(); };
const usEnd = (y: number) => { const d = new Date(Date.UTC(y, 10, 1, 6)); d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7)); return d.getTime(); };
export type Clock = "EU" | "US";
const offsetH = (serverMs: number, clock: Clock) => {
  const y = new Date(serverMs).getUTCFullYear(), approx = serverMs - 2 * H;
  const summer = clock === "EU" ? approx >= lastSunday(y, 2) && approx < lastSunday(y, 9) : approx >= usStart(y) && approx < usEnd(y);
  return summer ? 3 : 2;
};

export function load(tf: string, clock: Clock): Candle[] {
  const rows = readFileSync(path.join(FILES, `xau_${tf}.csv`), "latin1").trim().split(/\r?\n/).slice(1);
  return rows.map((l) => {
    const [t, o, h, lo, c] = l.split(",").map(Number);
    const server = t * 1000;
    // Daily and 4-hour bars are the broker's own sessions: kept at their server start, shifted to UTC.
    return { time: new Date(server - offsetH(server, clock) * H), open: o, high: h, low: lo, close: c };
  });
}

