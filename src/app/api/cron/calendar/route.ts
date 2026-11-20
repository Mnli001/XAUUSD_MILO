import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { FredCalendar } from "@/lib/data/fredCalendar";
import { ingestCalendar } from "@/lib/ingest/calendar";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.FRED_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "FRED_API_KEY тохируулаагүй байна" }, { status: 503 });
  const result = await ingestCalendar(new FredCalendar(key), new Date());
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
