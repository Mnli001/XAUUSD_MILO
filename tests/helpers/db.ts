import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { forgetKnownEntries } from "@/lib/bot/liveDb";

export async function resetDb() {
  await db.execute(sql`TRUNCATE payments, users, candles, bias_snapshots, economic_events, event_reactions, trades, bot_state, bot_tokens, bot_live, bot_deals, bot_entries, signals, live_ticks, rate_limits, password_resets CASCADE`);
  forgetKnownEntries();
}
