import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { getAlertsFeed } from "@/lib/alertsFeed";

export const dynamic = "force-dynamic";

/**
 * What the in-app alert sounds listen for: which setups are active right now (with the bar that
 * made them active, so the same activation is announced once) and when the next key release is.
 * Worked out once per 15-minute bar for everyone (see alertsFeed.ts).
 */
export async function GET() {
  const user = await getSessionUser();
  const now = new Date();
  if (!user || !hasAccess(user, now)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getAlertsFeed(now));
}
