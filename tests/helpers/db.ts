import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function resetDb() {
  await db.execute(sql`TRUNCATE users, candles, bias_snapshots, economic_events, event_reactions, trades, bot_state, bot_tokens, bot_live, bot_deals, signals, live_ticks CASCADE`);
}
