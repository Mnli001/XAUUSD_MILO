import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { loadReplay, replayDays } from "@/lib/replay.server";

export const dynamic = "force-dynamic";

/** A past day for bar replay: ?day=YYYY-MM-DD, or a random one. Signed-in users only. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  let day = new URL(req.url).searchParams.get("day");
  if (!day) {
    const days = await replayDays(now);
    if (!days.length) return NextResponse.json({ error: "empty" }, { status: 404 });
    day = days[Math.floor(Math.random() * days.length)];
  }
  const r = await loadReplay(day, now);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
}
