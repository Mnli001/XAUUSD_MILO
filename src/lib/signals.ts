import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { db, schema } from "./db";
import { hasAccess } from "./access";
import { getSetups, type Setup, type SetupsView } from "./setup/build";
import { sendMessage } from "./telegram";
import { wantsSignal } from "./account";
import { prefsOf } from "./prefsDb";
import { MN_VIEWER, viewer, type Viewer } from "./viewer";

const px = (v: number) => v.toFixed(2);
const DIP_QUIET_MS = 8 * 36e5; // the dip rule holds a trade for up to eight hours

/** The Telegram message for a setup that has just become active. Plain text, no markup. */
export function signalText(s: Setup, lastCandleAt: Date | null, now: Date, v: Viewer = MN_VIEWER): string {
  const { t } = v;
  const rr = s.entry !== null && s.stop !== null && s.target !== null && s.entry !== s.stop ? Math.abs(s.target - s.entry) / Math.abs(s.entry - s.stop) : null;
  const h = s.history;
  const lag = lastCandleAt ? Math.max(0, Math.round((now.getTime() - lastCandleAt.getTime()) / 6e4)) : null;
  return [
    `${s.side === "BUY" ? "🟢 BUY" : "🔴 SELL"} XAUUSD`,
    s.name,
    "",
    t(`Орох: ${px(s.entry!)} орчим`, `Entry: around ${px(s.entry!)}`),
    `Stop: ${px(s.stop!)}`,
    `Target: ${px(s.target!)}`,
    rr === null ? "" : `R:R  1 : ${rr.toFixed(1)}`,
    "",
    t("Баталгаажсан нөхцөл:", "Conditions met:"),
    ...s.checks.filter((c) => c.ok).map((c) => `✓ ${c.label}`),
    "",
    h.winPct === null ? t(`Түүхэн үр дүн: Дата хангалтгүй (${h.n} арилжаа)`, `Historical record: not enough data (${h.n} trades)`) : t(`Түүхэн үр дүн: ${h.n} арилжаа, ${h.winPct}% ашигтай, дундаж ${h.avgR! > 0 ? "+" : ""}${h.avgR!.toFixed(2)}R`, `Historical record: ${h.n} trades, ${h.winPct}% profitable, average ${h.avgR! > 0 ? "+" : ""}${h.avgR!.toFixed(2)}R`),
    lag === null ? "" : t(`Үнэ ${lag} минутын өмнөх лаанаас. Орохын өмнө MT5 дээрх одоогийн үнээ шалгаарай.`, `Price is from a candle ${lag} minutes ago. Check the current price on MT5 before entering.`),
    t("Түүхэн статистик дээр суурилсан дохио, санхүүгийн зөвлөгөө биш.", "A signal based on historical statistics, not financial advice."),
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
}

type Send = (chatId: string, text: string) => Promise<boolean>;

/**
 * Looks at the setups, records each newly active one once, and sends it to every user who has
 * linked Telegram and still has access. Returns how many new signals there were.
 */
export async function emitSignals(now: Date, opts: { view?: SetupsView; viewFor?: (v: Viewer) => Promise<SetupsView>; send?: Send } = {}): Promise<number> {
  const view = opts.view ?? (await getSetups(now));
  const send = opts.send ?? sendMessage;
  // The same reading in another language or on another clock, built once per kind of reader.
  const viewFor = opts.viewFor ?? (opts.view ? null : (v: Viewer) => getSetups(now, v));
  const readings = new Map<string, Promise<SetupsView>>([[`${MN_VIEWER.locale}|${MN_VIEWER.timeZone}`, Promise.resolve(view)]]);
  const reading = (v: Viewer): Promise<SetupsView> => {
    const key = `${v.locale}|${v.timeZone}`;
    if (!readings.has(key)) readings.set(key, viewFor ? viewFor(v).catch(() => view) : Promise.resolve(view));
    return readings.get(key)!;
  };
  let created = 0;
  for (const s of view.setups) {
    if (s.status !== "ACTIVE" || !s.side || s.entry === null || s.stop === null || s.target === null) continue;
    let key: string;
    if (s.id === "trend-dip") {
      const [recent] = await db.select({ id: schema.signals.id }).from(schema.signals).where(and(eq(schema.signals.setupId, s.id), gt(schema.signals.createdAt, new Date(now.getTime() - DIP_QUIET_MS)))).limit(1);
      if (recent) continue;
      key = `${s.id}:${now.toISOString().slice(0, 16)}`;
    } else key = `${s.id}:${now.toISOString().slice(0, 10)}`; // the Asian breakout: once per UTC day
    const [row] = await db.insert(schema.signals).values({ key, setupId: s.id, name: s.name, side: s.side, entry: s.entry, stop: s.stop, target: s.target, createdAt: now }).onConflictDoNothing({ target: schema.signals.key }).returning({ id: schema.signals.id });
    if (!row) continue;
    created++;
    const users = await db.select().from(schema.users).where(isNotNull(schema.users.telegramChatId));
    let sentTo = 0;
    for (const u of users) {
      if (!hasAccess(u, now) || !wantsSignal(u, s.id)) continue;
      const v = viewer(prefsOf(u));
      const theirs = (await reading(v)).setups.find((x) => x.id === s.id && x.status === "ACTIVE") ?? s;
      const text = signalText(theirs, view.lastCandleAt, now, v);
      try { if (await send(u.telegramChatId!, text)) sentTo++; } catch (e) { console.warn(`[signals] could not send to one chat: ${e instanceof Error ? e.message : e}`); }
    }
    await db.update(schema.signals).set({ sentTo }).where(eq(schema.signals.id, row.id));
  }
  return created;
}

export async function listSignals(limit: number) {
  return db.select().from(schema.signals).orderBy(desc(schema.signals.createdAt)).limit(limit);
}
