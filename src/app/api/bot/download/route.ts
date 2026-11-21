import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { botFile } from "@/lib/bot/download";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !hasAccess(user, new Date())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await botFile(new URL(req.url).searchParams.get("file") ?? "");
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(f.body), { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.filename}"`, "cache-control": "no-store" } });
}
