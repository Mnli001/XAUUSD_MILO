import "./i18n.server";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { ConditionAlert } from "./db/schema";
import { ema, rsi, type Candle, type Timeframe } from "./analysis/indicators";
import { finalCandles, loadCandles, SYMBOL } from "./ingest/prices";
import { TF_MS } from "./liveBar";
import { deliver, esc } from "./telegram";
import { sendPush, type PushMessage } from "./push";
import { prefsOf } from "./prefsDb";
import { MN_VIEWER, viewer, type Viewer } from "./viewer";

/**
 * Condition alerts: a message the moment a chart condition happens on a closed bar. Unlike a price alert it stays
 * after firing and fires again the next time the condition newly happens. Kinds:
 * - rsi_below / rsi_above: RSI (14) crosses the level on that bar;
 * - ema_cross_up / ema_cross_down: EMA 50 crosses EMA 200 (golden / death cross);
 * - prev_high_break / prev_low_break: a 15-minute close beyond yesterday's high / low, the first one of the day;
 * - prev_high_sweep / prev_low_sweep: a bar pokes beyond yesterday's high / low and closes back inside, the first of the day.
 */

export const CONDITION_KINDS = ["rsi_below", "rsi_above", "ema_cross_up", "ema_cross_down", "prev_high_break", "prev_low_break", "prev_high_sweep", "prev_low_sweep"] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];
export const CONDITION_TIMEFRAMES = ["15min", "1h", "4h"] as const;
export type ConditionTimeframe = (typeof CONDITION_TIMEFRAMES)[number];
export const MAX_CONDITION_ALERTS = 10;
const needsLevel = (k: ConditionKind) => k === "rsi_below" || k === "rsi_above";
const isDaily = (k: ConditionKind) => k.startsWith("prev_");
const DAY = 864e5;
const px = (v: number) => v.toFixed(2);

export type Hit = { kind: ConditionKind; bar: Candle; actual: number | null; level: number | null };

/** Whether the newest of `closed` bars makes the condition happen. `daily` are daily bars (for yesterday's range). */
export function conditionHit(a: { kind: ConditionKind; value: number | null }, closed: Candle[], daily: Candle[]): Hit | null {
  const n = closed.length;
  if (n < 2) return null;
  const bar = closed[n - 1];
  const closes = closed.map((c) => c.close);
  switch (a.kind) {
    case "rsi_below":
    case "rsi_above": {
      if (a.value === null) return null;
      const r = rsi(closes, 14);
      const now = r[n - 1], before = r[n - 2];
      if (!Number.isFinite(now) || !Number.isFinite(before)) return null;
      const crossed = a.kind === "rsi_below" ? now < a.value && before >= a.value : now > a.value && before <= a.value;
      return crossed ? { kind: a.kind, bar, actual: now, level: a.value } : null;
    }
    case "ema_cross_up":
    case "ema_cross_down": {
      if (n < 201) return null;
      const f = ema(closes, 50), s = ema(closes, 200);
      const up = f[n - 1] > s[n - 1] && f[n - 2] <= s[n - 2];
      const down = f[n - 1] < s[n - 1] && f[n - 2] >= s[n - 2];
      return (a.kind === "ema_cross_up" ? up : down) ? { kind: a.kind, bar, actual: f[n - 1], level: s[n - 1] } : null;
    }
    default: {
      const dayStart = Math.floor(bar.time.getTime() / DAY) * DAY;
      const prev = [...daily].reverse().find((d) => d.time.getTime() < dayStart);
      if (!prev) return null;
      const today = closed.filter((c) => c.time.getTime() >= dayStart);
      const earlier = today.slice(0, -1);
      const high = a.kind === "prev_high_break" || a.kind === "prev_high_sweep";
      const lvl = high ? prev.high : prev.low;
      const beyond = (x: number) => (high ? x > lvl : x < lvl);
      if (a.kind.endsWith("_break")) {
        const first = beyond(bar.close) && !earlier.some((c) => beyond(c.close));
        return first ? { kind: a.kind, bar, actual: bar.close, level: lvl } : null;
      }
      const swept = beyond(high ? bar.high : bar.low) && !beyond(bar.close) && !earlier.some((c) => beyond(high ? c.high : c.low));
      return swept ? { kind: a.kind, bar, actual: high ? bar.high : bar.low, level: lvl } : null;
    }
  }
}

const TF_LABEL: Record<ConditionTimeframe, string> = { "15min": "M15", "1h": "H1", "4h": "H4" };
export const tfLabel = (tf: string) => TF_LABEL[tf as ConditionTimeframe] ?? tf;

/** What the alert watches for, in the reader's language (the list on Today). */
export function conditionLabel(a: Pick<ConditionAlert, "kind" | "timeframe" | "value">, v: Viewer = MN_VIEWER): string {
  const { t } = v;
  const tf = tfLabel(a.timeframe);
  switch (a.kind as ConditionKind) {
    case "rsi_below": return t(`RSI (14) ${tf} ${a.value}-аас доош орвол`, `RSI (14) ${tf} falls below ${a.value}`);
    case "rsi_above": return t(`RSI (14) ${tf} ${a.value}-аас дээш гарвал`, `RSI (14) ${tf} rises above ${a.value}`);
    case "ema_cross_up": return t(`${tf}: EMA50 EMA200-г дээш огтолбол (golden cross)`, `${tf}: EMA50 crosses above EMA200 (golden cross)`);
    case "ema_cross_down": return t(`${tf}: EMA50 EMA200-г доош огтолбол (death cross)`, `${tf}: EMA50 crosses below EMA200 (death cross)`);
    case "prev_high_break": return t("Өчигдрийн high-аас дээш хаагдвал", "A close above yesterday's high");
    case "prev_low_break": return t("Өчигдрийн low-оос доош хаагдвал", "A close below yesterday's low");
    case "prev_high_sweep": return t("Өчигдрийн high-ийг sweep хийвэл", "Yesterday's high is swept");
    case "prev_low_sweep": return t("Өчигдрийн low-ийг sweep хийвэл", "Yesterday's low is swept");
    default: return a.kind;
  }
}

/** The message when it fires (Telegram HTML); the first line is also the notification title. */
export function conditionText(a: Pick<ConditionAlert, "timeframe">, h: Hit, v: Viewer = MN_VIEWER): string {
  const { t } = v;
  const tf = tfLabel(a.timeframe);
  const at = new Date(h.bar.time.getTime() + (TF_MS[a.timeframe as Timeframe] ?? 0));
  const head = (() => {
    switch (h.kind) {
      case "rsi_below": return t(`🔔 <b>RSI (14) ${tf} ${h.level}-аас доош орлоо: ${h.actual!.toFixed(1)}</b>`, `🔔 <b>RSI (14) ${tf} fell below ${h.level}: ${h.actual!.toFixed(1)}</b>`);
      case "rsi_above": return t(`🔔 <b>RSI (14) ${tf} ${h.level}-аас дээш гарлаа: ${h.actual!.toFixed(1)}</b>`, `🔔 <b>RSI (14) ${tf} rose above ${h.level}: ${h.actual!.toFixed(1)}</b>`);
      case "ema_cross_up": return t(`🔔 <b>${tf}: EMA50 EMA200-г дээш огтоллоо (golden cross)</b>`, `🔔 <b>${tf}: EMA50 crossed above EMA200 (golden cross)</b>`);
      case "ema_cross_down": return t(`🔔 <b>${tf}: EMA50 EMA200-г доош огтоллоо (death cross)</b>`, `🔔 <b>${tf}: EMA50 crossed below EMA200 (death cross)</b>`);
      case "prev_high_break": return t(`🔔 <b>Үнэ өчигдрийн high ${px(h.level!)}-аас дээш хаагдлаа</b>`, `🔔 <b>Price closed above yesterday's high ${px(h.level!)}</b>`);
      case "prev_low_break": return t(`🔔 <b>Үнэ өчигдрийн low ${px(h.level!)}-оос доош хаагдлаа</b>`, `🔔 <b>Price closed below yesterday's low ${px(h.level!)}</b>`);
      case "prev_high_sweep": return t(`🔔 <b>Өчигдрийн high ${px(h.level!)}-ийг sweep хийлээ</b>`, `🔔 <b>Yesterday's high ${px(h.level!)} was swept</b>`);
      case "prev_low_sweep": return t(`🔔 <b>Өчигдрийн low ${px(h.level!)}-ийг sweep хийлээ</b>`, `🔔 <b>Yesterday's low ${px(h.level!)} was swept</b>`);
    }
  })();
  return [head, t(`XAUUSD ${px(h.bar.close)} · ${v.time(at)} (${esc(v.zone)}) лаа хаагдахад`, `XAUUSD ${px(h.bar.close)} · bar closed ${v.time(at)} (${esc(v.zone)})`)].join("\n");
}

export type ConditionError = "kind" | "timeframe" | "value" | "limit";
export async function createConditionAlert(userId: string, input: { kind: ConditionKind; timeframe: ConditionTimeframe; value: number | null }, now = new Date()): Promise<{ alert?: ConditionAlert; error?: ConditionError }> {
  if (!(CONDITION_KINDS as readonly string[]).includes(input.kind)) return { error: "kind" };
  // yesterday's high and low are read on 15-minute bars whatever was asked
  const timeframe = isDaily(input.kind) ? "15min" : input.timeframe;
  if (!(CONDITION_TIMEFRAMES as readonly string[]).includes(timeframe)) return { error: "timeframe" };
  const value = needsLevel(input.kind) ? input.value : null;
  if (needsLevel(input.kind) && (value === null || !Number.isFinite(value) || value < 5 || value > 95)) return { error: "value" };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.conditionAlerts).where(eq(schema.conditionAlerts.userId, userId));
  if (n >= MAX_CONDITION_ALERTS) return { error: "limit" };
  const [alert] = await db.insert(schema.conditionAlerts).values({ userId, kind: input.kind, timeframe, value: value === null ? null : Math.round(value), createdAt: now }).returning();
  return { alert };
}

export async function deleteConditionAlert(userId: string, id: string): Promise<void> {
  await db.delete(schema.conditionAlerts).where(and(eq(schema.conditionAlerts.id, id), eq(schema.conditionAlerts.userId, userId)));
}

export async function listConditionAlerts(userId: string): Promise<ConditionAlert[]> {
  return db.select().from(schema.conditionAlerts).where(eq(schema.conditionAlerts.userId, userId)).orderBy(desc(schema.conditionAlerts.createdAt));
}

type Deps = { send?: (chat: string, html: string) => Promise<boolean>; push?: (userId: string, msg: PushMessage) => Promise<number> };

/**
 * After each price update: every alert of a member with a plan is checked against the newest closed bar of its
 * timeframe; one that hits is claimed for that bar (so two runners never both send it) and sent. Returns how many fired.
 */
export async function checkConditionAlerts(now: Date, deps: Deps = {}): Promise<number> {
  const send = deps.send ?? deliver;
  const push = deps.push ?? sendPush;
  const a = schema.conditionAlerts;
  const alerts = await db.select({ alert: a, user: schema.users }).from(a).innerJoin(schema.users, eq(schema.users.id, a.userId))
    .where(sql`(${schema.users.role} = 'ADMIN' OR ${schema.users.accessUntil} > ${now})`);
  if (!alerts.length) return 0;
  const bars = new Map<string, Promise<Candle[]>>();
  const closedOf = (tf: Timeframe) => {
    if (!bars.has(tf)) bars.set(tf, loadCandles(SYMBOL, tf, 260).then((c) => finalCandles(c, tf, now)));
    return bars.get(tf)!;
  };
  const daily = loadCandles(SYMBOL, "1day", 5);
  let fired = 0;
  for (const { alert, user } of alerts) {
    const tf = alert.timeframe as Timeframe;
    const closed = await closedOf(tf);
    const bar = closed.at(-1);
    // only bars that closed after the alert was set
    if (!bar || bar.time.getTime() + TF_MS[tf] <= alert.createdAt.getTime()) continue;
    if (alert.lastBarAt && alert.lastBarAt.getTime() >= bar.time.getTime()) continue;
    const hit = conditionHit({ kind: alert.kind as ConditionKind, value: alert.value }, closed, await daily);
    if (!hit) continue;
    const [claimed] = await db.update(a).set({ lastBarAt: bar.time, lastFiredAt: now })
      .where(and(eq(a.id, alert.id), or(isNull(a.lastBarAt), lt(a.lastBarAt, bar.time)))).returning({ id: a.id });
    if (!claimed) continue;
    fired++;
    const v = viewer(prefsOf(user));
    const html = conditionText(alert, hit, v);
    if (user.telegramChatId) await send(user.telegramChatId, html).catch((e) => console.warn(`[conditions] Telegram failed: ${e instanceof Error ? e.message : e}`));
    const [title, body] = html.split("\n").map((l) => l.replace(/<[^>]+>/g, ""));
    await push(user.id, { title, body, url: "/today#alerts", tag: `cond-${alert.id}` }).catch(() => 0);
  }
  return fired;
}
