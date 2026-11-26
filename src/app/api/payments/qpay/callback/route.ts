import { qpayConfig } from "@/lib/qpay";
import { refreshPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * QPay calls this after a payment. The body is not signed, so it is ignored: the id in the address only tells us
 * which of our invoices to ask QPay about. QPay expects a 200 either way.
 */
async function handle(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  const cfg = qpayConfig(process.env);
  if (id && cfg) {
    try { await refreshPayment(id, new Date(), cfg, { force: true }); } catch (e) { console.error("[qpay] callback check failed", e); }
  }
  return new Response("SUCCESS", { status: 200, headers: { "content-type": "text/plain" } });
}

export const GET = handle;
export const POST = handle;
