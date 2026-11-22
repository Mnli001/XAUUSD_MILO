import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { TwelveData } from "@/lib/data/twelveData";
import { ingestPrices } from "@/lib/ingest/prices";
import type { Timeframe } from "@/lib/analysis/indicators";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "TWELVEDATA_API_KEY тохируулаагүй байна" }, { status: 503 }); // i18n-ok: server log, machine reply or research-script name
  const scope = new URL(req.url).searchParams.get("scope");
  const tfs: Timeframe[] = scope === "hourly" ? ["1h", "4h", "1day"] : ["15min"];
  const result = await ingestPrices(new TwelveData(key), { tfs, now: new Date() });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
