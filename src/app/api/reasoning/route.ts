import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { getReasoning } from "@/lib/reasoningLive";
import { parseLocale } from "@/lib/prefs";

export const dynamic = "force-dynamic";

/** How each well-known method reads the market right now, in the signed-in user's language. */
export async function GET() {
  const user = await getSessionUser();
  const now = new Date();
  if (!user || !hasAccess(user, now)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ view: await getReasoning(now, parseLocale(user.locale)) }, { headers: { "cache-control": "no-store" } });
}
