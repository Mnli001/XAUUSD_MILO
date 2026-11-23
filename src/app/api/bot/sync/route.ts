import { NextResponse } from "next/server";
import { handleSync } from "@/lib/bot/liveDb";
import { reportSchema } from "@/lib/bot/live";

export const dynamic = "force-dynamic";

/** Called by the MT5 Expert Advisor every second or two. */
export async function POST(req: Request) {
  const token = req.headers.get("x-bot-token") ?? "";
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled as a rejected report below */ }
  const cmd = await handleSync(token, body, new Date());
  // A report the web cannot read is told apart from a wrong token, so the robot does not say "wrong token" for it.
  if (!cmd) return reportSchema.safeParse(body).success ? NextResponse.json({ error: "unauthorized" }, { status: 401 }) : NextResponse.json({ error: "bad report" }, { status: 400 });
  return NextResponse.json(cmd);
}
