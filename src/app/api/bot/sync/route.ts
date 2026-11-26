import { NextResponse } from "next/server";
import { handleSync } from "@/lib/bot/liveDb";
import { reportSchema } from "@/lib/bot/live";

export const dynamic = "force-dynamic";
const MAX_BODY = 256_000;

/** Called by the MT5 Expert Advisor every second or two. */
export async function POST(req: Request) {
  const token = req.headers.get("x-bot-token") ?? "";
  // A report is a few kilobytes; refuse anything far larger before reading it into memory.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: unknown = null;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch { /* handled as a rejected report below */ }
  const cmd = await handleSync(token, body, new Date());
  // A report the web cannot read is told apart from a wrong token, so the robot does not say "wrong token" for it.
  if (!cmd) return reportSchema.safeParse(body).success ? NextResponse.json({ error: "unauthorized" }, { status: 401 }) : NextResponse.json({ error: "bad report" }, { status: 400 });
  return NextResponse.json(cmd);
}
