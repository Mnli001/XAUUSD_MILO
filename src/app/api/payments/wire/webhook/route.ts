import { wireConfig, verifyWebhook, SIGNATURE_HEADER } from "@/lib/wire";
import { isRefundEvent, markRefunded, refreshByRef } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Wire posts signed events here (register https://<site>/api/payments/wire/webhook in the Wire dashboard).
 * The signature is checked against the raw body; even then a payment event only tells us which intent to ask
 * Wire about — access opens on Wire's own answer, never on the event's word.
 * 2xx = accepted; 5xx = Wire retries later; any other 4xx = Wire drops the delivery.
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = wireConfig(process.env);
  if (!cfg?.webhookSecret) return new Response("webhook not configured", { status: 503 });
  const raw = await req.text();
  const event = verifyWebhook(raw, req.headers.get(SIGNATURE_HEADER), cfg.webhookSecret, Math.floor(Date.now() / 1000));
  if (!event) return new Response("bad signature", { status: 400 });

  // Money returned (refund, chargeback, dispute): the event names the intent directly or through the refund object.
  if (isRefundEvent(event.type)) {
    const d = event.data ?? {};
    const intent = typeof d.payment_intent === "string" && d.payment_intent ? d.payment_intent : d.object === "payment_intent" && typeof d.id === "string" ? d.id : null;
    if (!intent) {
      console.warn(`[wire] ${event.type} without a payment intent id; check it in the Wire dashboard`);
      return Response.json({ received: true });
    }
    try {
      const p = await markRefunded(intent, new Date(), { type: event.type, amount: typeof d.amount === "number" ? d.amount : undefined });
      if (!p) console.warn(`[wire] ${event.type} for an intent that is not ours`);
    } catch (e) {
      console.error("[wire] refund handling failed", e);
      return new Response("refund failed", { status: 500 });
    }
    return Response.json({ received: true });
  }

  const ref = event.data?.id;
  if (event.type.startsWith("payment_intent.") && typeof ref === "string" && ref) {
    try {
      await refreshByRef(ref, new Date(), cfg);
    } catch (e) {
      console.error("[wire] webhook check failed", e);
      return new Response("check failed", { status: 500 });
    }
  }
  return Response.json({ received: true });
}
