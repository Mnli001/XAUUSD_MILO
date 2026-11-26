import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { qpayConfig } from "@/lib/qpay";
import { paymentFor, refreshPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** What the payment page polls: the payment's state, asking QPay first while it is still open. Owner only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let p = await paymentFor(id, user.id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const cfg = qpayConfig(process.env);
  if (cfg && p.status !== "PAID") {
    try { p = (await refreshPayment(id, new Date(), cfg)) ?? p; } catch (e) { console.error("[qpay] status check failed", e); }
  }
  return NextResponse.json({ status: p.status, accessUntil: p.accessUntil, expiresAt: p.expiresAt }, { headers: { "cache-control": "no-store" } });
}
