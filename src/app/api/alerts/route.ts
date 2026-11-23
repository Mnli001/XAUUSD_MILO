import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { getSetups } from "@/lib/setup/build";
import { getNextHighEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * What the in-app alert sounds listen for: which setups are active right now (with the bar that
 * made them active, so the same activation is announced once) and when the next key release is.
 */
export async function GET() {
  const user = await getSessionUser();
  const now = new Date();
  if (!user || !hasAccess(user, now)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [view, next] = await Promise.all([getSetups(now), getNextHighEvent(now)]);
  return NextResponse.json({
    active: view.setups.filter((s) => s.status === "ACTIVE").map((s) => `${s.id}@${s.at?.toISOString() ?? ""}`),
    nextRelease: next ? next.time.toISOString() : null,
  });
}
