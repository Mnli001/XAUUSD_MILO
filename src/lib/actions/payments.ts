"use server";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { isPlanId } from "../plans";
import { qpayConfig } from "../qpay";
import { startPayment } from "../payments";
import { siteUrl } from "../telegram";

/** A plan was chosen: open (or reuse) its QPay invoice and go to the payment page. */
export async function choosePlanAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const plan = form.get("plan");
  if (!isPlanId(plan)) redirect("/plans");
  const cfg = qpayConfig(process.env);
  const site = siteUrl();
  if (!cfg || !site) redirect("/plans?pay=off");
  let id: string | null = null;
  try {
    id = (await startPayment(user.id, plan, new Date(), cfg, site)).id;
  } catch (e) {
    console.error("[qpay] could not open an invoice", e);
  }
  redirect(id ? `/pay/${id}` : "/plans?pay=error"); // outside the try: redirect works by throwing
}
