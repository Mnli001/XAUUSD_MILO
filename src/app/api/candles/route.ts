import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { loadCandles, SYMBOL } from "@/lib/ingest/prices";
import { TIMEFRAMES, type Timeframe } from "@/lib/analysis/indicators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !hasAccess(user, new Date())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const tf = q.get("tf") as Timeframe;
  if (!TIMEFRAMES.includes(tf)) return NextResponse.json({ error: "tf буруу" }, { status: 400 });
  const limit = Math.min(Math.max(Number(q.get("limit")) || 500, 1), 1000);
  const candles = await loadCandles(SYMBOL, tf, limit);
  return NextResponse.json({ candles: candles.map((c) => ({ ...c, time: c.time.getTime() })) });
}
