import { NextResponse } from "next/server";
import { getPublicRecord } from "@/lib/publicRecord";

export const dynamic = "force-dynamic";

/**
 * The landing page's live record as JSON, for its chart to refresh. Public: figures only (no account login, owner,
 * ticket or token), worked out at most once a minute.
 */
export async function GET() {
  try {
    const record = await getPublicRecord(new Date());
    return NextResponse.json({ record }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  } catch (e) {
    console.warn("[public-record] not available:", e instanceof Error ? e.message : e);
    return NextResponse.json({ record: null }, { status: 503 });
  }
}
