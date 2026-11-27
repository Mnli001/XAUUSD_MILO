import "./i18n.server";
import { asc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { hasAccess } from "./access";
import { prefsOf } from "./prefsDb";
import { deliver, esc, telegramTiming } from "./telegram";
import { getSetups, type Setup } from "./setup/build";
import { SESSION_RULES, SIZE_STRONG, SIZE_WEAK, hourUtc, type SessionId } from "./setup/sessionRules";
import { getEvents } from "./events";
import { eventTitle } from "./data/calendarProvider";
import { DEFAULT_PARAMS } from "./bot/strategy";
import { weekdayName, zoneWeekday } from "./time";
import { claim } from "./watch";
import { MN_VIEWER, viewer, type Viewer } from "./viewer";

/**
 * The morning brief: at 08:00 Ulaanbaatar (00:00 UTC) on trading days, one short Telegram message with the price, the
 * two trend scores the setups read, what each of today's three setups can do, and the day's important releases.
 * Built from the same live readings as the Setup page (getSetups → rangeSetup), never from rules of its own.
 */
const M15 = 15 * 6e4;
/** The brief goes out from 00:00 UTC; after this hour (11:00 Ulaanbaatar) a missed one is skipped, not sent late. */
export const BRIEF_LAST_HOUR_UTC = 3;
const SEND_GAP_MS = 40; // under Telegram's 30 messages a second

export type BriefSetup = Pick<Setup, "id" | "name" | "status" | "side" | "headline" | "checks"> & Partial<Pick<Setup, "result" | "stale">>;
export type BriefState = {
  now: Date;
  price: number | null; // the latest 15-minute close
  prevClose: number | null; // the close of the previous trading day (Friday's on a Monday)
  trend: { daily: number | null; h4: number | null };
  setups: BriefSetup[];
  events: { time: Date; title: string; type: string }[]; // today's HIGH-impact releases
};

const px = (v: number) => v.toFixed(2);
const signed = (v: number, digits = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

/** A trend score's direction and strength in words: strong from 65, moderate from 35 (the same cut-offs as the trade size). */
export function trendWords(score: number | null, v: Viewer): { icon: string; dir: string; strength: string } {
  const { t } = v;
  if (score === null || score === 0) return { icon: "➖", dir: t("тодорхойгүй", "unclear"), strength: "" };
  const a = Math.abs(score);
  return {
    icon: score > 0 ? "📈" : "📉",
    dir: score > 0 ? t("дээш", "up") : t("доош", "down"),
    strength: a >= SIZE_STRONG ? t("хүчтэй", "strong") : a >= SIZE_WEAK ? t("дунд", "moderate") : t("сул", "weak"),
  };
}

/** One setup's line for the day, from its live reading: open, finished, off and why, or which way it may trade. */
export function setupOutlook(s: BriefSetup, trend: BriefState["trend"], v: Viewer): string {
  const { t } = v;
  const rule = SESSION_RULES.find((r) => r.id === s.id);
  if (s.stale) return `⚪ ${esc(s.headline)}`;
  if (s.status === "ACTIVE") return `🟢 ${esc(s.headline)} · ${esc(t("арилжаа нээлттэй", "trade open"))}`;
  if (s.result !== undefined) return `🏁 ${esc(s.headline)}`;
  if (s.status === "OFF") return `⛔ ${esc(s.headline)}`;
  // FORMING or WATCH: the reading's own checks say whether the trends allow a trade (0 range, 1 daily, 2 the 4-hour agrees)
  const daily = s.checks[1], h4 = s.checks[2];
  if (daily && !daily.ok) return `⛔ ${esc(t("Өнөөдөр орохгүй", "No trade today"))}: ${esc(daily.label)}`;
  const strength = Math.round(Math.abs(trend.daily ?? 0));
  if (rule && rule.minDailyScore > 0 && strength < rule.minDailyScore) {
    return `⛔ ${esc(t(`Өнөөдөр орохгүй: өдрийн trend-ийн хүч ${strength} < ${rule.minDailyScore}`, `No trade today: daily trend strength ${strength} < ${rule.minDailyScore}`))}`;
  }
  if (h4 && !h4.ok) return `⏸ ${esc(t("Одоогоор орохгүй", "Not for now"))}: ${esc(h4.label)}. ${esc(t("4 цагийн trend эргэвэл боломжтой.", "Possible if the 4-hour trend turns."))}`;
  if (s.status === "WATCH" && s.side) return `✅ ${esc(s.headline)}`;
  const side = (trend.daily ?? 0) > 0 ? "BUY" : "SELL";
  return `✅ ${esc(side === "BUY"
    ? t("Өнөөдөр боломжтой: зөвхөн BUY (хүрээнээс дээш хаагдвал)", "Possible today: BUY only (on a close above the range)")
    : t("Өнөөдөр боломжтой: зөвхөн SELL (хүрээнээс доош хаагдвал)", "Possible today: SELL only (on a close below the range)"))}`;
}

const ICON: Record<SessionId, string> = { "asian-breakout": "🌏", "ny-open-breakout": "🗽", "ny-late-breakout": "🌃" };

/** The brief (Telegram HTML), from a fixed state: no database, no clock of its own. */
export function briefText(s: BriefState, v: Viewer = MN_VIEWER): string {
  const { t } = v;
  const z = esc(v.zone);
  const at = (h: number) => v.ub(hourUtc((h + 8) % 24)); // a rule's UTC hour on the viewer's clock
  const day = `${weekdayName(zoneWeekday(s.now, v.timeZone), t)} ${v.date(s.now)}`;
  const lines = [t("☀️ <b>Өглөөний тойм · XAUUSD</b>", "☀️ <b>Morning brief · XAUUSD</b>"), `<i>${esc(day)}</i>`, ""];

  if (s.price !== null) {
    const change = s.prevClose ? s.price - s.prevClose : null;
    const pct = change !== null && s.prevClose ? (change / s.prevClose) * 100 : null;
    const arrow = change === null ? "💰" : change > 0 ? "🟢" : change < 0 ? "🔴" : "⚪";
    lines.push(change === null || pct === null
      ? t(`${arrow} Үнэ: <b>${px(s.price)}</b>`, `${arrow} Price: <b>${px(s.price)}</b>`)
      : t(`${arrow} Үнэ: <b>${px(s.price)}</b> (өмнөх хаалтаас ${signed(change)} · ${signed(pct)}%)`, `${arrow} Price: <b>${px(s.price)}</b> (${signed(change)} · ${signed(pct)}% vs the previous close)`));
  } else lines.push(t("💰 Үнэ: дата хараахан алга", "💰 Price: no data yet"));

  const trendLine = (label: string, score: number | null) => {
    const w = trendWords(score, v);
    const words = w.strength ? `${w.dir} · ${w.strength}` : w.dir;
    return `${w.icon} ${esc(label)}: <b>${esc(words)}</b>${score === null ? "" : ` (${signed(Math.round(score), 0)})`}`;
  };
  lines.push(trendLine(t("Өдрийн trend", "Daily trend"), s.trend.daily), trendLine(t("4 цагийн trend", "4-hour trend"), s.trend.h4));

  lines.push("", t("<b>Өнөөдрийн setup</b>", "<b>Today's setups</b>"));
  for (const rule of SESSION_RULES) {
    const setup = s.setups.find((x) => x.id === rule.id);
    if (!setup) continue;
    lines.push(
      `${ICON[rule.id]} <b>${esc(setup.name)}</b>`,
      esc(t(`Хүрээ ${at(rule.rangeFrom)}–${at(rule.rangeTo)}, орох ${at(rule.entryTo)} хүртэл (${v.zone})`, `Range ${at(rule.rangeFrom)}–${at(rule.rangeTo)}, entry until ${at(rule.entryTo)} (${v.zone})`)),
      setupOutlook(setup, s.trend, v),
    );
  }

  const high = s.events;
  lines.push("");
  if (high.length) {
    lines.push(t(`📅 <b>Өнөөдрийн чухал мэдээ</b> (${z})`, `📅 <b>Today's important releases</b> (${z})`));
    for (const e of high) lines.push(`🔴 ${v.time(e.time)} · ${esc(eventTitle(e, t))}`);
    lines.push(esc(t(`Мэдээний өмнөх ${DEFAULT_PARAMS.newsBeforeMin}, дараах ${DEFAULT_PARAMS.newsAfterMin} минутад гарсан breakout-ыг алгасна.`, `Breakouts from ${DEFAULT_PARAMS.newsBeforeMin} minutes before to ${DEFAULT_PARAMS.newsAfterMin} minutes after a release are skipped.`)));
  } else lines.push(t("📅 Өнөөдөр чухал мэдээ алга.", "📅 No important releases today."));

  lines.push("", t("🔔 Дохио гармагц шууд илгээнэ.", "🔔 Signals are sent the moment they fire."), `<i>${esc(t("/brief off — өглөөний тоймыг зогсоох", "/brief off — stop the morning brief"))}</i>`);
  return lines.join("\n");
}

/** The previous trading day's close: the last 15-minute bar before today 00:00 UTC, skipping Sunday's reopen hours. */
export function prevCloseOf(bars: { time: Date; close: number }[], now: Date): number | null {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    if (b.time.getTime() + M15 <= dayStart && b.time.getUTCDay() !== 0) return b.close;
  }
  return null;
}

/** Today's state for the brief, read for one viewer (the setups' words are in their language and on their clock). */
export async function loadBrief(now: Date, v: Viewer = MN_VIEWER): Promise<BriefState> {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [view, events] = await Promise.all([
    getSetups(now, v),
    getEvents(new Date(Math.max(dayStart, now.getTime() - DEFAULT_PARAMS.newsAfterMin * 6e4)), new Date(dayStart + 864e5 - 1)),
  ]);
  return {
    now,
    price: view.candles.at(-1)?.close ?? null,
    prevClose: prevCloseOf(view.candles, now),
    trend: view.trend ?? { daily: null, h4: null },
    setups: view.setups,
    events: events.filter((e) => e.impact === "HIGH"),
  };
}

/** Whether this member gets the scheduled brief: a linked chat, a plan, signals not paused, and not opted out. */
export const wantsBrief = (u: Pick<User, "telegramChatId" | "role" | "accessUntil" | "briefOff" | "signalsPaused">, now: Date): boolean =>
  !!u.telegramChatId && hasAccess(u, now) && !u.briefOff && !u.signalsPaused;

/** Weekdays (Monday–Friday UTC, so 08:00 Monday–Friday in Ulaanbaatar) between 00:00 and BRIEF_LAST_HOUR_UTC. */
export function briefDue(now: Date): boolean {
  const d = now.getUTCDay();
  return d >= 1 && d <= 5 && now.getUTCHours() < BRIEF_LAST_HOUR_UTC;
}

export const briefKey = (now: Date) => `brief:${now.toISOString().slice(0, 10)}`;

/**
 * Sends the morning brief once per trading day (claimed in app_state, so a restart or a second runner never sends it
 * twice) to every member who wants it. Returns how many chats it reached.
 */
export async function sendMorningBrief(now: Date, opts: { send?: (chat: string, html: string) => Promise<boolean>; load?: (now: Date, v: Viewer) => Promise<BriefState> } = {}): Promise<number> {
  if (!briefDue(now)) return 0;
  if (!(await claim(briefKey(now), now.toISOString(), now))) return 0;
  const send = opts.send ?? deliver;
  const load = opts.load ?? loadBrief;
  const readings = new Map<string, Promise<BriefState>>();
  const users = await db.select().from(schema.users).where(isNotNull(schema.users.telegramChatId)).orderBy(asc(schema.users.createdAt));
  const chats = new Set<string>();
  let sent = 0;
  for (const u of users) {
    if (!wantsBrief(u, now) || chats.has(u.telegramChatId!)) continue;
    chats.add(u.telegramChatId!);
    const v = viewer(prefsOf(u));
    const key = `${v.locale}|${v.timeZone}`;
    if (!readings.has(key)) readings.set(key, load(now, v));
    try {
      if (await send(u.telegramChatId!, briefText(await readings.get(key)!, v))) sent++;
    } catch (e) {
      console.warn(`[brief] could not send to one chat: ${e instanceof Error ? e.message : e}`);
    }
    await telegramTiming.sleep(SEND_GAP_MS);
  }
  return sent;
}

/** /brief off and /brief on from Telegram. */
export async function setBriefOff(userId: string, off: boolean): Promise<void> {
  await db.update(schema.users).set({ briefOff: off }).where(eq(schema.users.id, userId));
}
