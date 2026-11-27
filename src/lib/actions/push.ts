"use server";
import { requireUser } from "../auth";
import { getT } from "../prefs.server";
import { removePushSubscription, savePushSubscription, sendPush } from "../push";
import { hit, LIMITS } from "../rateLimit";

export type PushState = { ok?: string; error?: string };

/** Called by the browser right after it subscribed; `sub` is `PushSubscription.toJSON()`. */
export async function subscribePushAction(sub: unknown): Promise<PushState> {
  const user = await requireUser();
  const t = await getT();
  const r = await savePushSubscription(user.id, sub);
  return r.error ? { error: t("Энэ төхөөрөмжийг бүртгэж чадсангүй.", "Could not register this device.") } : { ok: t("Мэдэгдэл асаалаа.", "Notifications are on.") };
}

export async function unsubscribePushAction(endpoint: string): Promise<PushState> {
  const user = await requireUser();
  const t = await getT();
  if (typeof endpoint === "string" && endpoint) await removePushSubscription(user.id, endpoint);
  return { ok: t("Энэ төхөөрөмж дээр мэдэгдэл унтарлаа.", "Notifications are off on this device.") };
}

export async function testPushAction(): Promise<PushState> {
  const user = await requireUser();
  const t = await getT();
  if (!(await hit("push-test", user.id, LIMITS.pushTest))) return { error: t("Хэт олон оролдлого. Цагийн дараа дахин оролдоно уу.", "Too many tries. Try again in an hour.") };
  const n = await sendPush(user.id, { title: "XAU Analytics", body: t("Туршилтын мэдэгдэл. Дохио, мэдээ, үнийн сэрэмжлүүлэг ингэж ирнэ.", "Test notification. Signals, news and price alerts arrive like this."), url: "/settings#push", tag: "test" });
  return n > 0 ? { ok: t("Илгээлээ. Хэдэн секундэд ирэх ёстой.", "Sent. It should arrive in a few seconds.") } : { error: t("Илгээж чадсангүй. Мэдэгдлийг унтрааж дахин асаагаад оролдоно уу.", "Could not send. Turn notifications off and on again, then retry.") };
}
