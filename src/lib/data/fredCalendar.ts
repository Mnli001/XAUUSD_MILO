import { type CalendarProvider, type EventType, EVENT_TYPES, nyLocalToUtc } from "./calendarProvider";
import { ProviderError } from "./priceProvider";

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
      let res: Response;
      try {
        res = await fetch(`https://api.stlouisfed.org/fred/release/dates?${q}`, { cache: "no-store" });
      } catch (e) {
        throw new ProviderError(`FRED руу холбогдож чадсангүй: ${(e as Error).message}`, 0); // i18n-ok: server log, machine reply or research-script name
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
    return out.sort((a, b) => a.time.getTime() - b.time.getTime());
  }
}
