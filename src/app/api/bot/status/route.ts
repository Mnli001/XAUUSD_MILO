import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { getLiveView } from "@/lib/bot/liveDb";

export const dynamic = "force-dynamic";

/** The signed-in user's own bot. */
export async function GET() {
  const user = await getSessionUser();
  const now = new Date();
  if (!user || !hasAccess(user, now)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getLiveView(user.id, now));
}
