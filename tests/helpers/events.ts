import type { Candle } from "@/lib/analysis/indicators";

/** One event per move; price is 100 at the release and 100+move for the whole following hour. */
export function buildEvents(moves: number[]): { times: Date[]; m15: Candle[] } {
  const times: Date[] = [];
  const m15: Candle[] = [];
  moves.forEach((move, i) => {
    const t = Date.UTC(2026, 0, 14, 13, 30) + i * 28 * 864e5;
    times.push(new Date(t));
    for (let k = 0; k < 4; k++) {
      m15.push({ time: new Date(t + k * 15 * 6e4), open: k === 0 ? 100 : 100 + move, high: 100 + Math.abs(move), low: 100 - Math.abs(move), close: 100 + move });
    }
  });
  return { times, m15 };
}
