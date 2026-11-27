import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { loadDrawings, saveDrawings } from "@/lib/drawings";

export const dynamic = "force-dynamic";
const MAX_BYTES = 200_000;

/** The member's chart drawings. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ drawings: await loadDrawings(user.id) }, { headers: { "cache-control": "no-store" } });
}

/** Saves the whole list (the page sends it a moment after each change). */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad" }, { status: 400 }); }
  const drawings = await saveDrawings(user.id, (body as { drawings?: unknown })?.drawings);
  return NextResponse.json({ saved: drawings.length });
}
