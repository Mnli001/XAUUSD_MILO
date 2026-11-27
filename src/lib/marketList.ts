import type { T } from "./i18n";

/**
 * The other instruments the site reads, besides gold. Hourly and daily bars only: the price provider's daily budget
 * is spent on gold's 15-minute bars. `feed` is the provider's name for it; Nasdaq 100 is read through the QQQ fund,
 * which follows the index (its price level differs from a CFD's, its direction does not).
 */
export type MarketDef = { symbol: string; feed: string; digits: number };
export const MARKETS: MarketDef[] = [
  { symbol: "XAGUSD", feed: "XAG/USD", digits: 3 },
  { symbol: "EURUSD", feed: "EUR/USD", digits: 5 },
  { symbol: "NAS100", feed: "QQQ", digits: 2 },
  { symbol: "BTCUSD", feed: "BTC/USD", digits: 2 },
];
export const GOLD = "XAUUSD";
export const isMarket = (s: unknown): s is string => typeof s === "string" && MARKETS.some((m) => m.symbol === s);
export const isAlertSymbol = (s: unknown): s is string => s === GOLD || isMarket(s);
export const digitsOf = (symbol: string): number => MARKETS.find((m) => m.symbol === symbol)?.digits ?? 2;
export const fmtPrice = (v: number, symbol: string) => v.toFixed(digitsOf(symbol));

export function marketName(symbol: string, t: T): string {
  switch (symbol) {
    case "XAUUSD": return t("Алт", "Gold");
    case "XAGUSD": return t("Мөнгө", "Silver");
    case "EURUSD": return t("Евро / доллар", "Euro / dollar");
    case "NAS100": return "Nasdaq 100 (QQQ)";
    case "BTCUSD": return "Bitcoin";
    default: return symbol;
  }
}
