import type { Candle, Timeframe } from "../analysis/indicators";
import { type PriceProvider, ProviderError } from "./priceProvider";

const SYMBOLS: Record<string, string> = { XAUUSD: "XAU/USD" };

type Row = { datetime: string; open: string; high: string; low: string; close: string };

function parseTime(s: string): Date {
  return new Date(s.length === 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`);
}

export class TwelveData implements PriceProvider {
  constructor(private apiKey: string) {}

  async fetchCandles(symbol: string, tf: Timeframe, opts: { outputsize: number; endDate?: Date }): Promise<Candle[]> {
    const q = new URLSearchParams({
      symbol: SYMBOLS[symbol] ?? symbol,
      interval: tf,
      outputsize: String(opts.outputsize),
      timezone: "UTC",
      apikey: this.apiKey,
    });
    if (opts.endDate) q.set("end_date", opts.endDate.toISOString().slice(0, 19).replace("T", " "));

    let res: Response;
    try {
      res = await fetch(`https://api.twelvedata.com/time_series?${q}`, { cache: "no-store" });
    } catch (e) {
      throw new ProviderError(`Twelve Data руу холбогдож чадсангүй: ${(e as Error).message}`, 0);
    }
    let body: { status?: string; message?: string; values?: Row[] } | null = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body is handled below */
    }
    if (!res.ok || !body || body.status === "error" || !Array.isArray(body.values)) {
      throw new ProviderError(body?.message ?? `Twelve Data HTTP ${res.status}`, res.status);
    }
    const candles = body.values.map((v) => ({
      time: parseTime(v.datetime),
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
    }));
    if (candles.some((c) => Number.isNaN(c.time.getTime()) || ![c.open, c.high, c.low, c.close].every(Number.isFinite))) {
      throw new ProviderError("Twelve Data-аас буруу форматтай мөр ирлээ", res.status);
    }
    return candles.sort((a, b) => a.time.getTime() - b.time.getTime());
  }
}
