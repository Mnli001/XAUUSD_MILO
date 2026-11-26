import { wireConfig, verifyWebhook, SIGNATURE_HEADER } from "@/lib/wire";
import { refreshByRef } from "@/lib/payments";

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
