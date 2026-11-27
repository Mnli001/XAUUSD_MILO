import * as webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * Web push: notifications to a phone or computer that agreed to them, with or without Telegram. The server signs
 * each push with a VAPID key pair; the pair is made on first use and kept in app_state, so nothing has to be set up
 * by hand (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the environment override it). Every device that subscribes
 * keeps working until it unsubscribes or the push service reports it gone.
 */

export type PushMessage = { title: string; body: string; url: string; tag?: string };
type Keys = { publicKey: string; privateKey: string };
type Target = { endpoint: string; keys: { p256dh: string; auth: string } };

const KEY = "push:vapid";
let cached: Promise<Keys> | null = null;

async function loadKeys(): Promise<Keys> {
  const env = { publicKey: process.env.VAPID_PUBLIC_KEY ?? "", privateKey: process.env.VAPID_PRIVATE_KEY ?? "" };
  if (env.publicKey && env.privateKey) return env;
  const read = async () => (await db.select().from(schema.appState).where(eq(schema.appState.key, KEY)).limit(1))[0]?.value;
  let stored = await read();
  if (!stored) {
    // two servers starting together both insert; the first one wins and both read it back
    await db.insert(schema.appState).values({ key: KEY, value: JSON.stringify(webpush.generateVAPIDKeys()), updatedAt: new Date() }).onConflictDoNothing({ target: schema.appState.key });
    stored = await read();
  }
  return JSON.parse(stored!) as Keys;
}
const keys = () => (cached ??= loadKeys().catch((e) => { cached = null; throw e; }));

/** The public half, which the browser needs to subscribe. */
export const vapidPublicKey = async () => (await keys()).publicKey;

function subject(): string {
  const admin = process.env.ADMIN_EMAIL;
  if (admin && /^[^@\s]+@[^@\s]+$/.test(admin)) return `mailto:${admin}`;
  const site = process.env.APP_URL ?? process.env.NEXTAUTH_URL;
  return site?.startsWith("https://") ? site : "mailto:admin@example.com";
}

/** How a push leaves the server; tests replace `send`. */
export const pushTransport = {
  send: async (target: Target, payload: string, opts: { ttl: number; urgency: "high" | "normal" }): Promise<void> => {
    const k = await keys();
    await webpush.sendNotification(target, payload, { TTL: opts.ttl, urgency: opts.urgency, vapidDetails: { subject: subject(), publicKey: k.publicKey, privateKey: k.privateKey } });
  },
};

const MAX_ENDPOINT = 1024;

/** Stores a browser's subscription (as `PushSubscription.toJSON()` gives it) for this user. */
export async function savePushSubscription(userId: string, input: unknown): Promise<{ error?: "invalid" }> {
  const s = input as Partial<Target> | null;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "";
  const auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
  let ok = endpoint.length > 0 && endpoint.length <= MAX_ENDPOINT && p256dh.length > 0 && p256dh.length <= 200 && auth.length > 0 && auth.length <= 100;
  try { ok &&= new URL(endpoint).protocol === "https:"; } catch { ok = false; }
  if (!ok) return { error: "invalid" };
  await db.insert(schema.pushSubscriptions).values({ userId, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId, p256dh, auth } });
  return {};
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.endpoint, endpoint)));
}

export async function pushDeviceCount(userId: string): Promise<number> {
  return (await db.select({ id: schema.pushSubscriptions.id }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId))).length;
}

/** The users who have at least one device subscribed. */
export async function pushUserIds(): Promise<Set<string>> {
  return new Set((await db.selectDistinct({ userId: schema.pushSubscriptions.userId }).from(schema.pushSubscriptions)).map((r) => r.userId));
}

const isGone = (e: unknown) => {
  const code = (e as { statusCode?: number })?.statusCode;
  return code === 404 || code === 410;
};

/**
 * Sends one message to every device of the user. Returns how many devices took it. Devices the push service says
 * no longer exist are forgotten; other failures are logged and the device is kept for next time.
 */
export async function sendPush(userId: string, msg: PushMessage, opts: { ttl?: number; urgency?: "high" | "normal" } = {}): Promise<number> {
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  if (!subs.length) return 0;
  const payload = JSON.stringify(msg);
  const gone: string[] = [];
  let ok = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await pushTransport.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { ttl: opts.ttl ?? 3600, urgency: opts.urgency ?? "high" });
      ok++;
    } catch (e) {
      if (isGone(e)) gone.push(s.id);
      else console.warn(`[push] could not reach one device: ${(e as { statusCode?: number })?.statusCode ?? (e instanceof Error ? e.message : e)}`);
    }
  }));
  if (gone.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, gone));
  return ok;
}

/** Telegram HTML to the plain text a notification shows. */
export const plain = (html: string) => html.replace(/<[^>]+>/g, "").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
