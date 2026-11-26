import { NextResponse } from "next/server";
import { recordTick } from "@/lib/feed";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { hashToken } from "@/lib/bot/live";
import { findUserById } from "@/lib/users";
import { z } from "zod";
import { feedToken, safeEqual } from "@/lib/cron";

export const dynamic = "force-dynamic";

const tickSchema = z.object({
  symbol: z.string().min(1).max(20),
  bid: z.number().positive(),
  ask: z.number().positive(),
  server: z.string().max(100).optional().nullable(),
  spread: z.number().optional().nullable(),
});

/**
 * Dedicated ultra-fast endpoint for the MT5 Live Price Bridge (XauFeed).
 * Broadcasts live gold bid/ask from an Amazon/VPS MT5 instance to the entire website in real-time.
 */
export async function POST(req: Request) {
  const token = req.headers.get("x-bot-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
  }

  // The feed's own shared secret (FEED_TOKEN; CRON_SECRET only while that is unset), compared in constant time,
  // or an admin's bot token
  let isAuthorized = false;
  const shared = feedToken();
  if (shared && safeEqual(token, shared)) {
    isAuthorized = true;
  } else {
    const hashed = hashToken(token);
    const [link] = await db.select().from(schema.botTokens).where(eq(schema.botTokens.tokenHash, hashed));
    if (link) {
      const owner = await findUserById(link.userId);
      if (owner && owner.role === "ADMIN") {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized: Admin feed token required" }, { status: 403 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = tickSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tick data format", details: parsed.error.format() }, { status: 400 });
  }

  const now = new Date();
  const kept = await recordTick(parsed.data, now);
  if (!kept) {
    return NextResponse.json({ error: "Tick rejected: must be valid gold symbol (XAU/GOLD) and realistic bid/ask" }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    symbol: parsed.data.symbol,
    bid: parsed.data.bid,
    ask: parsed.data.ask,
    now: now.getTime(),
  }, {
    headers: { "cache-control": "no-store" }
  });
}
