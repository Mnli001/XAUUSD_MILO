import { NextResponse } from "next/server";
import { handleSync } from "@/lib/bot/liveDb";

export const dynamic = "force-dynamic";

/** Called by the MT5 Expert Advisor every second or two. */
export async function POST(req: Request) {
  const token = req.headers.get("x-bot-token") ?? "";
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled as a rejected report below */ }
  const cmd = await handleSync(token, body, new Date());
  if (!cmd) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(cmd);
}
