import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getQuote } from "@/lib/feed";

export const dynamic = "force-dynamic";

/** The newest gold price for every open page: live from the owner's MT5 when it is on, the last stored candle otherwise. */
export async function GET() {
  const user = await getSessionUser();
  const now = new Date();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ quote: await getQuote(now), now: now.getTime() }, { headers: { "cache-control": "no-store" } });
}
