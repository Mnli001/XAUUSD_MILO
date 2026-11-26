"use server";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { isPlanId } from "../plans";
import { wireConfig } from "../wire";
import { startPayment } from "../payments";
import { siteUrl } from "../telegram";

/** A plan was chosen: open (or reuse) its Wire payment and send the buyer to Wire's hosted checkout. */
export async function choosePlanAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const plan = form.get("plan");
  if (!isPlanId(plan)) redirect("/plans");
  const cfg = wireConfig(process.env);
  const site = siteUrl();
  if (!cfg || !site) redirect("/plans?pay=off");
  let url: string | null = null;
  try {
    url = (await startPayment(user.id, plan, new Date(), cfg, site)).checkoutUrl;
  } catch (e) {
    console.error("[wire] could not open a payment", e);
  }
  redirect(url ?? "/plans?pay=error"); // outside the try: redirect works by throwing
}
