import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { TwelveData } from "@/lib/data/twelveData";
import { ingestPrices } from "@/lib/ingest/prices";
import { runTelegramJobs } from "@/lib/signals";
import type { Timeframe } from "@/lib/analysis/indicators";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "TWELVEDATA_API_KEY тохируулаагүй байна" }, { status: 503 }); // i18n-ok: server log, machine reply or research-script name
  const scope = new URL(req.url).searchParams.get("scope");
  const tfs: Timeframe[] = scope === "hourly" ? ["1h", "4h", "1day"] : ["15min"];
  const now = new Date();
  const result = await ingestPrices(new TwelveData(key), { tfs, now });
  // the same follow-up as the in-process scheduler, so an external cron sends Telegram signals too
  const telegram = scope === "hourly" ? null : await runTelegramJobs(now, result.ok);
  return NextResponse.json({ ...result, telegram }, { status: result.ok ? 200 : 502 });
}
