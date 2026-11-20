import type { Candle, Timeframe } from "../analysis/indicators";

export interface PriceProvider {
  /** Returns candles oldest first. */
  fetchCandles(symbol: string, tf: Timeframe, opts: { outputsize: number; endDate?: Date }): Promise<Candle[]>;
}

export class ProviderError extends Error {
  constructor(msg: string, public status: number) {
    super(msg);
    this.name = "ProviderError";
  }
}
