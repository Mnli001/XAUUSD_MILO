import { NextResponse } from "next/server";
import { capReport, handleSync } from "@/lib/bot/liveDb";
import { hashToken, reportSchema } from "@/lib/bot/live";
import { robotLimiter } from "@/lib/bot/syncLimit";

export const dynamic = "force-dynamic";
const MAX_BODY = 256_000;

/** Called by the MT5 Expert Advisor every second or two. */
export async function POST(req: Request) {
  const token = req.headers.get("x-bot-token") ?? "";
  // At most ~2 reports a second per token (a short burst allowed); the robot waits and tries again on a 429.
  // Counted by the token's hash, so no raw token is kept in memory.
  const wait = robotLimiter.take(token ? hashToken(token) : "no-token");
  if (wait) return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": String(wait) } });
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
  if (!cmd) return reportSchema.safeParse(capReport(body)).success ? NextResponse.json({ error: "unauthorized" }, { status: 401 }) : NextResponse.json({ error: "bad report" }, { status: 400 });
  return NextResponse.json(cmd);
}
