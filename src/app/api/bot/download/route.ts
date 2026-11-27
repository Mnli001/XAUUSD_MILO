import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { botFile } from "@/lib/bot/download";
import { userForToken } from "@/lib/bot/liveDb";

export const dynamic = "force-dynamic";

/**
 * The robot files for members. The compiled robot (file=ex5) can also be fetched with the robot token in an
 * x-bot-token header, so the Windows installer can get the current file without a browser session.
 */
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("file") ?? "";
  const now = new Date();
  const user = await getSessionUser();
  let allowed = !!user && hasAccess(user, now);
  const token = req.headers.get("x-bot-token")?.trim() ?? "";
  if (!allowed && kind === "ex5" && token) {
    const owner = await userForToken(token);
    allowed = !!owner && hasAccess(owner, now);
  }
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await botFile(kind);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(f.body), { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.filename}"`, "cache-control": "no-store" } });
}
