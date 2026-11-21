import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getLiveView } from "@/lib/bot/liveDb";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getLiveView(new Date()));
}
