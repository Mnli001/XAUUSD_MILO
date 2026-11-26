import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isChartTf } from "@/lib/chartTf";
import { loadChartCandles } from "@/lib/chartCandles";

export const dynamic = "force-dynamic";

/** Candles for the chart: tf is one of 1min 5min 15min 30min 1h 4h 1day 1week. Signed-in users only. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const tf = q.get("tf");
  if (!isChartTf(tf)) return NextResponse.json({ error: "bad tf" }, { status: 400 });
  const limit = Math.min(Math.max(Number(q.get("limit")) || 500, 1), 1000);
  try {
    const candles = await loadChartCandles(tf, limit, new Date());
    return NextResponse.json({ candles: candles.map((c) => ({ ...c, time: c.time.getTime() })) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.warn(`[candles] ${tf} unavailable: ${(e as Error).message}`);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
