import type { Candle, Timeframe } from "../analysis/indicators";
import { type PriceProvider, ProviderError } from "./priceProvider";

const SYMBOLS: Record<string, string> = { XAUUSD: "XAU/USD" };

type Row = { datetime: string; open: string; high: string; low: string; close: string };

function parseTime(s: string): Date {
  return new Date(s.length === 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`);
}

export class TwelveData implements PriceProvider {
  constructor(private apiKey: string) {}

  async fetchCandles(symbol: string, tf: Timeframe | "1min" | "5min", opts: { outputsize: number; endDate?: Date }): Promise<Candle[]> {
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
      res = await fetch(`https://api.twelvedata.com/time_series?${q}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      const err = e as Error & { cause?: { code?: string; message?: string } };
      const why = err.cause?.code ?? err.cause?.message ?? err.name;
      throw new ProviderError(`Twelve Data руу холбогдож чадсангүй: ${err.message} (${why})`, 0); // i18n-ok: server log, machine reply or research-script name
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
      throw new ProviderError("Twelve Data-аас буруу форматтай мөр ирлээ", res.status); // i18n-ok: server log, machine reply or research-script name
    }
    return candles.sort((a, b) => a.time.getTime() - b.time.getTime());
  }
}
