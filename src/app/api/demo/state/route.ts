import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { demoView } from "@/lib/demo/server";

export const dynamic = "force-dynamic";

/** One demo account as the terminal draws it: balance, equity, positions, orders, history and the live price. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("account") ?? "";
  const view = id ? await demoView(user.id, id) : null;
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(view, { headers: { "cache-control": "no-store" } });
}
