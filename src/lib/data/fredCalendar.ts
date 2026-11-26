import { type CalendarProvider, type EventType, EVENT_TYPES, FOMC_DECISION_DAYS, nyLocalToUtc } from "./calendarProvider";
import { ProviderError } from "./priceProvider";

/** How often a dropped connection to FRED is tried, and the pause before the next try. */
export const FRED_ATTEMPTS = 4;
export let fredPause = (attempt: number) => 2000 * attempt;
export const setFredPause = (f: (attempt: number) => number) => { fredPause = f; };

/** US release dates from FRED. FRED publishes dates only; the time of day comes from EVENT_TYPES. */
export class FredCalendar implements CalendarProvider {
  constructor(private apiKey: string, private types: EventType[] = EVENT_TYPES) {}

  async fetchEvents(from: Date, to: Date): Promise<{ type: string; time: Date }[]> {
    const out: { type: string; time: Date }[] = [];
    for (const t of this.types) {
      if (t.fredReleaseId === null) continue;
      const q = new URLSearchParams({
        release_id: String(t.fredReleaseId),
        include_release_dates_with_no_data: "true",
        sort_order: "desc",
        limit: "200",
        file_type: "json",
        api_key: this.apiKey,
      });
      let res: Response | null = null;
      // A dropped connection is retried with a pause; the cause is logged, since "fetch failed" alone says nothing.
      for (let attempt = 1; !res; attempt++) {
        try {
          res = await fetch(`https://api.stlouisfed.org/fred/release/dates?${q}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
        } catch (e) {
          const cause = (e as { cause?: { code?: string; message?: string } }).cause;
          const why = `${(e as Error).message}${cause ? ` (${cause.code ?? cause.message ?? "?"})` : ""}`;
          if (attempt >= FRED_ATTEMPTS) throw new ProviderError(`FRED руу холбогдож чадсангүй: ${why}`, 0); // i18n-ok: server log, machine reply or research-script name
          console.warn(`[calendar] FRED attempt ${attempt} failed: ${why}`);
          await new Promise((r) => setTimeout(r, fredPause(attempt)));
        }
      }
      const body = (await res.json().catch(() => null)) as { release_dates?: { date: string }[]; error_message?: string } | null;
      if (!res.ok || !body || !Array.isArray(body.release_dates)) {
        throw new ProviderError(body?.error_message ?? `FRED HTTP ${res.status}`, res.status);
      }
      for (const { date } of body.release_dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const time = nyLocalToUtc(date, t.nyTime);
        if (time >= from && time <= to) out.push({ type: t.type, time });
      }
    }
    // FOMC has no FRED release: its decision days come from the Fed's published schedule.
    const fomc = this.types.find((t) => t.type === "FOMC");
    if (fomc) for (const day of FOMC_DECISION_DAYS) {
      const time = nyLocalToUtc(day, fomc.nyTime);
      if (time >= from && time <= to) out.push({ type: "FOMC", time });
    }
    return out.sort((a, b) => a.time.getTime() - b.time.getTime());
  }
}
