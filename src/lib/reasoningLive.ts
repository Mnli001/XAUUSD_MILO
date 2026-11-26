import "./i18n.server";
import { reason, type Reasoning } from "./analysis/reasoning";
import { getQuote, loadLiveCandles } from "./feed";
import type { Quote } from "./liveBar";
import type { Locale } from "./i18n";
import { translator } from "./i18n";

export type ReasoningView = { reasoning: Reasoning; quote: Quote; computedAt: number };

// Every open page asks for this every few seconds; the candles behind it are read once per window.
const TTL_MS = process.env.NODE_ENV === "test" ? 0 : 4000;
const kept = new Map<Locale, ReasoningView>();

/** The multi-method read of the market right now, on the live price when the feed is up. Null until candles exist. */
export async function getReasoning(now: Date, locale: Locale): Promise<ReasoningView | null> {
  const hit = kept.get(locale);
  if (hit && now.getTime() - hit.computedAt < TTL_MS) return hit;
  const quote = await getQuote(now);
  if (!quote) return null;
  const [m15, h1, h4, d1] = await Promise.all([loadLiveCandles("15min", 300, now), loadLiveCandles("1h", 300, now), loadLiveCandles("4h", 300, now), loadLiveCandles("1day", 60, now)]);
  const view = { reasoning: reason({ m15, h1, h4, d1, price: quote.price, now }, translator(locale)), quote, computedAt: now.getTime() };
  kept.set(locale, view);
  return view;
}
