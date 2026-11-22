import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleUpdate, telegramConfigured, webhookSecret } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Called by Telegram when someone writes to the bot. */
export async function POST(req: Request) {
  const given = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(webhookSecret());
  if (!telegramConfigured() || given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await handleUpdate(await req.json());
  } catch (e) {
    console.error("[telegram] update failed", e); // answer 200 anyway, or Telegram retries the same update for hours
  }
  return NextResponse.json({ ok: true });
}
