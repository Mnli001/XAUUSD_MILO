import "../i18n.server";
import { and, asc, desc, eq, gte, lte, max, ne, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { User } from "../db/schema";
import { findUserById } from "../users";
import { applyRisk, type RiskVerdict } from "../risk";
import { JOURNAL_BACKFILL_DAYS, storeJournal } from "../journal";
import { recordTick } from "../feed";
import { hasAccess } from "../access";
import { mnT, type T } from "../i18n";
import { parseLocale } from "../prefs";
import { type Command, type DayOrderFields, type LiveConfig, type Report, type SessionOrderFields, robotLang, BLACKOUT_HORIZON_MS, MAX_REPORT_CHARS, stoppedCommand, DEFAULT_LIVE_CONFIG, blackoutWindows, commandFor, hashToken, newToken, parseConfig, parseGate, parseSimple, reportSchema } from "./live";
import { getReasoning } from "../reasoningLive";
import { DAY_MIN_LEAN, dayOrderFrom, getDayState } from "./daySignal";
import { getAsianOrders } from "../setup/build";
import { applyPreset, isPreset, type ConsensusCounts } from "./live";
import { sessionOfUbHour, ubHour } from "../time";
import { deliver, esc, telegramConfigured } from "../telegram";
import { translator } from "../i18n";

export const ONLINE_WITHIN_MS = 15_000;

/**
 * Every robot reports every second or two, so what a report needs that rarely changes is kept in memory (per server
 * instance) for a short while instead of being read each time:
 * - ownerTtlMs: which user a token belongs to, and that user (access, language, Telegram). Rotating the token here
 *   forgets it at once; another instance lets the old token work for at most this long.
 * - journalTtlMs: where the robot's journal history should resume (forgotten when it sends new journal rows).
 * - newsTtlMs: the HIGH-impact release times the news pause is worked out from.
 * - seenEveryMs: a report that changes nothing a person can see (state, positions, signal, filter verdict, deals…)
 *   writes nothing; last_seen_at (and the equity/price shown) is then refreshed at most this often. Kept well under
 *   ONLINE_WITHIN_MS so a quiet robot never looks offline.
 * The bot row itself (Start/Stop, settings) is read on every report, so a button pressed on the site reaches the
 * robot on its next report from any instance. All 0 in tests (always read, always write) unless a test sets them.
 */
const TEST = process.env.NODE_ENV === "test";
export const syncTiming = {
  ownerTtlMs: TEST ? 0 : 30_000,
  journalTtlMs: TEST ? 0 : 30_000,
  newsTtlMs: TEST ? 0 : 60_000,
  seenEveryMs: TEST ? 0 : 10_000,
};
/** At most this many rows of each kind are taken from one report; the rest are dropped (and logged). */
export const MAX_REPORT_DEALS = 200;
export const MAX_REPORT_POSITIONS = 100;

const MAX_MEMO = 20_000;
function remember<V>(m: Map<string, V>, key: string, value: V): void {
  m.delete(key);
  m.set(key, value);
  while (m.size > MAX_MEMO) m.delete(m.keys().next().value as string);
}
const ownerMemo = new Map<string, { at: number; owner: User }>(); // by token hash
const journalMemo = new Map<string, { at: number; latest: number | null }>(); // by user:login: the newest stored journal trade (ms)
let newsMemo: { at: number; from: number; to: number; times: Date[] } | null = null;
/** Forgets every in-memory copy (tests, or after a bulk change). */
export function forgetSyncCaches(): void {
  ownerMemo.clear();
  journalMemo.clear();
  newsMemo = null;
}
const forgetOwner = (userId: string) => { for (const [k, v] of ownerMemo) if (v.owner.id === userId) ownerMemo.delete(k); };

/** The user a robot token belongs to (by its hash), from memory while fresh. */
async function ownerOfToken(token: string): Promise<User | null> {
  const hash = hashToken(token);
  const hit = ownerMemo.get(hash);
  if (hit && Date.now() - hit.at < syncTiming.ownerTtlMs) return hit.owner;
  const [link] = await db.select({ userId: schema.botTokens.userId }).from(schema.botTokens).where(eq(schema.botTokens.tokenHash, hash));
  const owner = link ? await findUserById(link.userId) : null;
  if (owner && syncTiming.ownerTtlMs > 0) remember(ownerMemo, hash, { at: Date.now(), owner });
  else ownerMemo.delete(hash);
  return owner;
}

/**
 * Cuts a report's deal and position lists to what one report may carry (MAX_REPORT_DEALS, MAX_REPORT_POSITIONS),
 * logging what was dropped. Anything else is returned untouched; the schema then decides whether it is a report.
 */
export function capReport(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as { deals?: unknown; positions?: unknown };
  const cut: string[] = [];
  let out = body as Record<string, unknown>;
  if (Array.isArray(b.deals) && b.deals.length > MAX_REPORT_DEALS) { cut.push(`deals ${b.deals.length}→${MAX_REPORT_DEALS}`); out = { ...out, deals: b.deals.slice(0, MAX_REPORT_DEALS) }; }
  if (Array.isArray(b.positions) && b.positions.length > MAX_REPORT_POSITIONS) { cut.push(`positions ${b.positions.length}→${MAX_REPORT_POSITIONS}`); out = { ...out, positions: b.positions.slice(0, MAX_REPORT_POSITIONS) }; }
  if (cut.length) console.warn(`[bot] report truncated: ${cut.join(", ")}`);
  return out;
}

/** What a report shows a person, without the numbers that move on every tick (prices, equity, open profit, clocks). */
function visibleFingerprint(status: unknown): string {
  if (!status || typeof status !== "object") return "";
  const { bid: _b, ask: _a, runPnl: _r, dayPnl: _d, elapsedSeconds: _e, account, positions, ...rest } = status as Record<string, unknown>;
  void _b; void _a; void _r; void _d; void _e;
  const acc = account && typeof account === "object" ? { ...(account as Record<string, unknown>), balance: undefined, equity: undefined } : account;
  const pos = Array.isArray(positions) ? positions.map((p) => (p && typeof p === "object" ? { ...(p as Record<string, unknown>), profit: undefined } : p)) : positions;
  return stableJson([rest, acc, pos]);
}
/** JSON with object keys sorted (jsonb hands keys back in its own order) and undefined left out. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableJson(x))).join(",")}]`;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

type Row = typeof schema.botLive.$inferSelect;
const shape = (row: Row) => {
  const stored = row.config as Partial<LiveConfig>;
  return { ...row, state: row.state as "RUNNING" | "STOPPED", config: { ...DEFAULT_LIVE_CONFIG, ...stored, basket: { ...DEFAULT_LIVE_CONFIG.basket, ...stored.basket }, rule: { ...DEFAULT_LIVE_CONFIG.rule, ...stored.rule }, gate: { ...DEFAULT_LIVE_CONFIG.gate, ...stored.gate } } };
};
const rowsOf = (userId: string) => db.select().from(schema.botLive).where(eq(schema.botLive.userId, userId)).orderBy(sql`${schema.botLive.lastSeenAt} DESC NULLS LAST`, schema.botLive.login);

/**
 * Which of the user's accounts is meant: the asked-for one if it is theirs, otherwise the one the
 * robot reported from last, otherwise "" (no account has connected yet).
 */
async function accountOf(userId: string, login?: string): Promise<string> {
  const rows = await rowsOf(userId);
  if (login !== undefined && rows.some((r) => r.login === login)) return login;
  return rows[0]?.login ?? "";
}

/** A user's bot for one account (by default the current one), created on first use. Callers check that the user may use the system. */
export async function getLive(userId: string, login?: string) {
  const acc = await accountOf(userId, login);
  await db.insert(schema.botLive).values({ userId, login: acc, config: DEFAULT_LIVE_CONFIG }).onConflictDoNothing();
  const [row] = await db.select().from(schema.botLive).where(and(eq(schema.botLive.userId, userId), eq(schema.botLive.login, acc)));
  return shape(row);
}

const update = (userId: string, login: string, set: Partial<typeof schema.botLive.$inferInsert>) =>
  db.update(schema.botLive).set(set).where(and(eq(schema.botLive.userId, userId), eq(schema.botLive.login, login)));

export async function saveLiveConfig(userId: string, input: unknown, t: T = mnT, login?: string): Promise<{ error?: string }> {
  const live = await getLive(userId, login);
  const r = parseConfig(input, live.config, t);
  if (!r.config) return { error: r.error };
  await update(userId, live.login, { config: r.config });
  return {};
}

export async function saveGateConfig(userId: string, input: unknown, t: T = mnT, login?: string): Promise<{ error?: string }> {
  const live = await getLive(userId, login);
  const preset = (input as { preset?: unknown } | null)?.preset;
  if (isPreset(preset)) { await update(userId, live.login, { config: applyPreset(live.config, preset) }); return {}; }
  const r = parseGate(input, live.config, t);
  if (!r.config) return { error: r.error };
  await update(userId, live.login, { config: r.config });
  return {};
}

/** The Bot page's settings: Setup signals, sized by % of balance or a fixed lot, and the real-account switch. The rest is kept. */
export async function saveSimpleConfig(userId: string, input: unknown, t: T = mnT, login?: string): Promise<{ error?: string }> {
  const live = await getLive(userId, login);
  const r = parseSimple(input, live.config, t);
  if (!r.config) return { error: r.error };
  await update(userId, live.login, { config: r.config });
  return {};
}

/**
 * The order(s) for this bot right now. The Asian tool trades the Setup page's own breakouts (every session's live
 * setup, so the robot and the Telegram signal never disagree); the day trader its own setup when the reading backs it.
 */
async function ordersFor(config: LiveConfig, now: Date): Promise<{ day: DayOrderFields | null; session: SessionOrderFields[] }> {
  if (config.mode === "ASIAN") { try { return { day: null, session: await getAsianOrders(now) }; } catch (e) { console.error("[bot] asian signal failed", e); return { day: null, session: [] }; } }
  if (config.mode !== "DAY") return { day: null, session: [] };
  try { return { day: dayOrderFrom(await getDayState(now), config.gate?.dayLean ?? DAY_MIN_LEAN, now), session: [] }; } catch (e) { console.error("[bot] day signal failed", e); return { day: null, session: [] }; }
}

/** The many-method reading as counts, when this bot waits for it. Null when it cannot be computed: the robot then holds back. */
async function consensusFor(config: LiveConfig, now: Date): Promise<ConsensusCounts | null> {
  const needsCounts = !!config.gate?.on && (config.gate.minAgree ?? 0) > 0;
  if (!needsCounts && !config.gate?.siteStops && config.mode !== "READING") return null;
  try {
    const view = await getReasoning(now, "en");
    if (!view) return null;
    const { buy, sell, neutral } = view.reasoning;
    return { buy, sell, total: buy + sell + neutral, atrH1: view.reasoning.atrH1 };
  } catch { return null; }
}

/** Margin read around the asked-for window, so one read serves every robot's news settings for a while. */
const NEWS_MARGIN_MS = 24 * 3600e3;
/** HIGH-impact release times covering [from, to], read at most once per syncTiming.newsTtlMs for all robots. */
async function highEventsBetween(from: number, to: number, now: Date): Promise<Date[]> {
  const m = newsMemo;
  if (m && Date.now() - m.at < syncTiming.newsTtlMs && m.from <= from && m.to >= to) return m.times;
  const lo = Math.min(from, now.getTime() - NEWS_MARGIN_MS), hi = Math.max(to, now.getTime() + BLACKOUT_HORIZON_MS + NEWS_MARGIN_MS);
  const rows = await db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(and(
    eq(schema.economicEvents.impact, "HIGH"),
    gte(schema.economicEvents.time, new Date(lo)),
    lte(schema.economicEvents.time, new Date(hi)),
  ));
  const times = rows.map((r) => r.time);
  if (syncTiming.newsTtlMs > 0) newsMemo = { at: Date.now(), from: lo, to: hi, times };
  return times;
}

async function blackoutsFor(config: LiveConfig, now: Date): Promise<string> {
  const g = config.gate;
  if (!g.on || (g.newsBeforeMin <= 0 && g.newsAfterMin <= 0)) return "";
  const from = now.getTime() - g.newsAfterMin * 6e4, to = now.getTime() + BLACKOUT_HORIZON_MS + g.newsBeforeMin * 6e4;
  return blackoutWindows((await highEventsBetween(from, to, now)).filter((t) => t.getTime() >= from && t.getTime() <= to), g.newsBeforeMin, g.newsAfterMin, now);
}

export async function startBot(userId: string, now: Date, login?: string): Promise<void> {
  const live = await getLive(userId, login);
  // Start always runs the site's Setup signals. A bot saved on another tool (Day trader, Reading, Basket or the retired
  // scalper) is moved over; the scalper's lot size goes with it, every other setting stays as it was.
  const config = { ...live.config, mode: "ASIAN" as const, rule: live.config.mode === "SCALPER" ? { ...live.config.rule, lots: live.config.lots } : live.config.rule };
  await update(userId, live.login, { config, state: "RUNNING", runId: crypto.randomUUID(), closeAll: false, startedAt: now, stoppedAt: null, stopReason: null });
}

/** Stopping also asks the terminal to close the bot's open positions. */
export async function stopBot(userId: string, reason: string, now: Date, login?: string): Promise<void> {
  const live = await getLive(userId, login);
  await update(userId, live.login, { state: "STOPPED", closeAll: true, stoppedAt: now, stopReason: reason });
}

export async function requestCloseAll(userId: string, login?: string): Promise<void> {
  const live = await getLive(userId, login);
  await update(userId, live.login, { closeAll: true });
}

/** Returns the new token once; only its hash is kept. The previous token stops working for every account. */
export async function rotateToken(userId: string): Promise<string> {
  await getLive(userId);
  const token = newToken();
  await db.insert(schema.botTokens).values({ userId, tokenHash: hashToken(token) }).onConflictDoUpdate({ target: schema.botTokens.userId, set: { tokenHash: hashToken(token) } });
  forgetOwner(userId);
  return token;
}

/** The user a robot token belongs to (looked up by its hash), or null. Callers check access. */
export async function userForToken(token: string) {
  if (!token) return null;
  const [link] = await db.select().from(schema.botTokens).where(eq(schema.botTokens.tokenHash, hashToken(token)));
  return link ? findUserById(link.userId) : null;
}

const masked = (login: string) => `••••${login.slice(-4)}`;

/** The user's MT5 accounts that have connected, most recently seen first. */
export async function listAccounts(userId: string, now: Date) {
  return accountsFrom(await rowsOf(userId), now);
}
function accountsFrom(rows: Row[], now: Date) {
  return rows.filter((r) => r.login !== "").map((r) => {
    const status = r.status as Status | null;
    return {
      login: r.login,
      server: r.server,
      label: r.server ? `${r.server} · ${masked(r.login)}` : masked(r.login),
      mode: status?.account.mode ?? null,
      state: r.state as "RUNNING" | "STOPPED",
      online: !!r.lastSeenAt && now.getTime() - r.lastSeenAt.getTime() <= ONLINE_WITHIN_MS,
    };
  });
}
export type AccountItem = Awaited<ReturnType<typeof listAccounts>>[number];

/** A user may link this many MT5 accounts; a report from one more is answered with a bare stop (TOO_MANY_ACCOUNTS). */
export const MAX_ROBOT_ACCOUNTS = 3;

/**
 * The bot for the account a report comes from. A bot set up before any account connected is taken over by the first
 * one. Null when the account is new and the user already has MAX_ROBOT_ACCOUNTS accounts.
 */
async function botForAccount(userId: string, login: string) {
  const mine = eq(schema.botLive.userId, userId);
  const [existing] = await db.select().from(schema.botLive).where(and(mine, eq(schema.botLive.login, login)));
  if (existing) return shape(existing);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.botLive).where(and(mine, ne(schema.botLive.login, "")));
  if (n >= MAX_ROBOT_ACCOUNTS) return null;
  const [adopted] = await db.update(schema.botLive).set({ login }).where(and(mine, eq(schema.botLive.login, ""))).returning();
  if (adopted) {
    await db.update(schema.botDeals).set({ login }).where(and(eq(schema.botDeals.userId, userId), eq(schema.botDeals.login, "")));
    return shape(adopted);
  }
  // A new account starts stopped, with default settings.
  await db.insert(schema.botLive).values({ userId, login, config: DEFAULT_LIVE_CONFIG }).onConflictDoNothing();
  const [row] = await db.select().from(schema.botLive).where(and(mine, eq(schema.botLive.login, login)));
  return shape(row);
}

/**
 * Which robot may set the site's live price: one account only. With FEED_BOT_LOGIN set, the robot signed in to that
 * MT5 account, and only when its owner is an admin. Without it, the first robot of the first admin: the oldest
 * admin user's connected account with the lowest login. Every other terminal (other admins' accounts included)
 * moves nobody's chart. Looked up at most once a minute.
 */
let feedMemo: { at: number; userId: string | null; login: string | null } | null = null;
const FEED_MEMO_MS = process.env.NODE_ENV === "test" ? 0 : 60_000;
export const forgetFeedSource = () => { feedMemo = null; };
async function isFeedRobot(owner: { id: string; role: string }, login: string): Promise<boolean> {
  if (owner.role !== "ADMIN") return false;
  const dedicated = process.env.FEED_BOT_LOGIN?.trim();
  if (dedicated) return login === dedicated;
  if (!feedMemo || Date.now() - feedMemo.at >= FEED_MEMO_MS) {
    const [admin] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "ADMIN")).orderBy(asc(schema.users.createdAt), asc(schema.users.id)).limit(1);
    const [first] = admin ? await db.select({ login: schema.botLive.login }).from(schema.botLive).where(and(eq(schema.botLive.userId, admin.id), ne(schema.botLive.login, ""))).orderBy(asc(schema.botLive.login)).limit(1) : [];
    feedMemo = { at: Date.now(), userId: admin?.id ?? null, login: first?.login ?? null };
  }
  return feedMemo.userId === owner.id && feedMemo.login === login;
}

const tooLarge = (body: unknown) => {
  try { return JSON.stringify(body ?? null).length > MAX_REPORT_CHARS; } catch { return true; }
};

/**
 * Where this account's journal history resumes (epoch seconds, 0 when unknown), as journalFrom says: the newest
 * stored journal trade, or JOURNAL_BACKFILL_DAYS back from now. The newest trade is kept in memory while fresh.
 */
async function journalFromCached(userId: string, login: string, now: Date): Promise<number> {
  const key = `${userId}:${login}`;
  let hit = journalMemo.get(key);
  if (!hit || Date.now() - hit.at >= syncTiming.journalTtlMs) {
    const jt = schema.journalTrades;
    const rows = await db.select({ at: max(jt.closeTime) }).from(jt).where(and(eq(jt.userId, userId), eq(jt.login, login))).catch(() => null);
    if (!rows) return 0; // not kept: the next report asks again
    hit = { at: Date.now(), latest: rows[0]?.at ? new Date(rows[0].at).getTime() : null };
    if (syncTiming.journalTtlMs > 0) remember(journalMemo, key, hit);
  }
  return Math.floor((hit.latest ?? now.getTime() - JOURNAL_BACKFILL_DAYS * 864e5) / 1000);
}

/** One round trip with the terminal: store what it reports, answer with what it should do. null = rejected. */
export async function handleSync(token: string, body: unknown, now: Date): Promise<Command | null> {
  if (!token || tooLarge(body)) return null;
  // The token picks the user: it is looked up by its hash, which is unique. The report's account picks the bot.
  const owner = await ownerOfToken(token);
  if (!owner) return null;
  try {
    return await syncFor(owner, body, now);
  } catch (e) {
    // the account was deleted while its owner was still in memory: from now on the token is unknown
    const err = e as { code?: string; cause?: { code?: string } };
    if ((err?.cause?.code ?? err?.code) === "23503") { ownerMemo.delete(hashToken(token)); return null; }
    throw e;
  }
}

async function syncFor(owner: User, body: unknown, now: Date): Promise<Command | null> {
  const parsed = reportSchema.safeParse(capReport(body));
  if (!parsed.success) return null;
  const r: Report = parsed.data;
  const lang = robotLang(parseLocale(owner.locale));
  // No access: a bare stop, decided before any reading, order or release time is worked out for this robot.
  if (!hasAccess(owner, now)) {
    await db.update(schema.botLive).set({ state: "STOPPED", stopReason: "NO_ACCESS", stoppedAt: now, lastSeenAt: now })
      .where(and(eq(schema.botLive.userId, owner.id), eq(schema.botLive.login, r.account.login), eq(schema.botLive.state, "RUNNING")));
    return stoppedCommand("NO_ACCESS", lang);
  }
  const live = await botForAccount(owner.id, r.account.login);
  if (!live) return stoppedCommand("TOO_MANY_ACCOUNTS", lang);
  // One terminal is the site's price feed: everyone's chart moves with what it reports.
  if (await isFeedRobot(owner, live.login).catch(() => false)) await recordTick({ symbol: r.symbol, bid: r.bid, ask: r.ask, server: r.account.server }, now).catch((e) => console.error("[feed] tick not kept", e));

  if (r.deals.length) {
    const fresh = await db.insert(schema.botDeals).values(r.deals.map((d) => ({ ...d, userId: owner.id, login: live.login, runId: live.runId }))).onConflictDoNothing().returning();
    // Deals already a day old when first seen (a robot reconnecting) are stored but not announced.
    for (const d of fresh) if (now.getTime() - d.closeTime.getTime() < 10 * 60_000) notify(owner, tradeClosedText(owner, d));
  }
  if (r.journal?.length) {
    await storeJournal(owner.id, live.login, r.journal).catch((e) => console.error("[journal] not kept", e));
    journalMemo.delete(`${owner.id}:${live.login}`);
  }
  await recordEntries(owner, live.login, r.positions, now).catch((e) => console.error("[bot] entry not recorded", e));

  let { state, closeAll, stopReason } = live;
  let stoppedAt = live.stoppedAt;
  // The member's own loss limits (risk manager): past one the bot stops, and closes its trades if they asked.
  const risk = await applyRisk(owner.id, live.login, { equity: r.account.equity }, now).catch((e) => { console.error("[risk] check failed", e); return { stop: false, closeAll: false } as RiskVerdict; });
  if (risk.stop && state === "RUNNING") { state = "STOPPED"; stopReason = risk.reason ?? "RISK"; stoppedAt = now; }
  if (risk.closeAll) closeAll = true;
  if (r.positions.length === 0) closeAll = false; // nothing left to close
  if (state === "RUNNING" && r.finished) { state = "STOPPED"; stopReason = r.finished; stoppedAt = now; }
  const orders = await ordersFor(live.config, now);
  const cmd = commandFor({ state, runId: live.runId, closeAll, config: live.config }, r.account, r.version, lang, await blackoutsFor(live.config, now), await consensusFor(live.config, now), orders.day, orders.session);
  if (state === "RUNNING" && cmd.state === "STOPPED") { state = "STOPPED"; stopReason = cmd.reason; stoppedAt = now; }

  const jFrom = await journalFromCached(owner.id, live.login, now);
  const { deals: _deals, journal: _journal, account, ...rest } = r;
  void _deals; void _journal;
  const status = { ...rest, account: { ...account, login: masked(account.login) } };
  const server = account.server ?? live.server;
  // Nothing a person would see has changed and the row was touched a moment ago: write nothing (see syncTiming).
  const isSteady =
    state === live.state &&
    closeAll === live.closeAll &&
    stopReason === live.stopReason &&
    server === live.server &&
    r.deals.length === 0 &&
    !r.journal?.length &&
    !!live.lastSeenAt &&
    now.getTime() - live.lastSeenAt.getTime() >= 0 &&
    now.getTime() - live.lastSeenAt.getTime() < syncTiming.seenEveryMs &&
    visibleFingerprint(status) === visibleFingerprint(live.status);

  if (!isSteady) {
    await update(owner.id, live.login, { state, closeAll, stopReason, stoppedAt, lastSeenAt: now, server, status });
  }
  return jFrom ? { ...cmd, jFrom } : cmd;
}

type Status = Omit<Report, "deals">;
export type LiveView = Awaited<ReturnType<typeof getLiveView>>;

/** A bot that has no row yet, as getLive would create it (shown without writing it). */
const unsavedBot = (userId: string): Row => ({ userId, login: "", server: null, state: "STOPPED", runId: null, closeAll: false, config: DEFAULT_LIVE_CONFIG, startedAt: null, stoppedAt: null, stopReason: null, lastSeenAt: null, status: null });

/**
 * Everything the control page shows. Read-only and two queries: the user's bots (with whether a token exists), and
 * the chosen account's last 50 deals with the total count and the last 24 hours' profit worked out alongside.
 * The page polls this (recommended every 5 s while running, 30 s while stopped).
 */
export async function getLiveView(userId: string, now: Date, login?: string) {
  const bl = schema.botLive, bd = schema.botDeals;
  const rows = await db.select({ row: bl, hasToken: sql<boolean>`exists (select 1 from ${schema.botTokens} where ${schema.botTokens.userId} = ${userId})` })
    .from(bl).where(eq(bl.userId, userId)).orderBy(sql`${bl.lastSeenAt} DESC NULLS LAST`, bl.login);
  const bots = rows.map((x) => x.row);
  const picked = (login !== undefined ? bots.find((b) => b.login === login) : undefined) ?? bots[0];
  const live = shape(picked ?? unsavedBot(userId));
  const hasToken = rows.length ? !!rows[0].hasToken : (await db.select({ u: schema.botTokens.userId }).from(schema.botTokens).where(eq(schema.botTokens.userId, userId))).length > 0;
  const status = live.status as Status | null;
  const since = new Date(now.getTime() - 864e5);
  const dealRows = picked ? await db.select({
    deal: bd,
    n: sql<number>`(count(*) over ())::int`,
    total: sql<string | null>`sum(${bd.profit}) filter (where ${bd.closeTime} >= ${since}) over ()`,
  }).from(bd).where(and(eq(bd.userId, userId), eq(bd.login, live.login))).orderBy(desc(bd.closeTime)).limit(50) : [];
  const deals = dealRows.map((x) => x.deal);
  const n = dealRows[0]?.n ?? 0;
  const total = dealRows[0]?.total ?? null;
  return {
    account: live.login,
    accounts: accountsFrom(bots, now),
    accountServer: live.server,
    state: live.state,
    stopReason: live.stopReason,
    startedAt: live.startedAt,
    stoppedAt: live.stoppedAt,
    closeAllPending: live.closeAll,
    config: live.config,
    hasToken,
    online: !!live.lastSeenAt && now.getTime() - live.lastSeenAt.getTime() <= ONLINE_WITHIN_MS,
    lastSeenAt: live.lastSeenAt,
    accountMode: status?.account.mode ?? null,
    accountLogin: status?.account.login ?? null,
    balance: status?.account.balance ?? null,
    equity: status?.account.equity ?? null,
    currency: status?.account.currency ?? "USD",
    symbol: status?.symbol ?? null,
    bid: status?.bid ?? null,
    ask: status?.ask ?? null,
    signal: status?.signal ?? null,
    reason: status?.reason ?? null,
    runPnl: status?.runPnl ?? null,
    robotVersion: status?.version ?? null,
    plannedSeconds: status?.plannedSeconds ?? null,
    elapsedSeconds: status?.elapsedSeconds ?? null,
    positions: status?.positions ?? [],
    // The entry filter as the robot last reported it (null from robot files older than v2.80).
    gateOn: status?.gateOn ?? null,
    block: status?.block ?? null,
    blockDetail: status?.blockDetail ?? null,
    tradesToday: status?.tradesToday ?? null,
    dayPnl: status?.dayPnl ?? null,
    dailyLossHit: status?.dailyLossHit ?? null,
    // The robot's own loss guard (v3.94+): "" none, LOSS_DAY, LOSS_DD or NETTING, with its numbers; null from older files.
    // Kept in bot_live.status with the rest of the report, so no column is needed.
    guard: status?.guard ?? null,
    guardDetail: status?.guardDetail ?? null,
    deals,
    dealCount: n,
    pnl24h: Number(total ?? 0),
  };
}

// ---- What the reading said when each position was opened, and how those trades ended ----

type Owner = NonNullable<Awaited<ReturnType<typeof findUserById>>>;
/** Position tickets already written, so a robot reporting every second costs no query once its trades are known. */
const knownEntries = new Set<string>();
/** Enough for every open position of every robot many times over; past it the oldest are forgotten (a forgotten one costs one insert that does nothing). */
export const MAX_KNOWN_ENTRIES = 20_000;
export const forgetKnownEntries = () => knownEntries.clear();
function rememberEntry(key: string): void {
  knownEntries.delete(key);
  knownEntries.add(key);
  while (knownEntries.size > MAX_KNOWN_ENTRIES) knownEntries.delete(knownEntries.values().next().value as string);
}
export const knownEntryCount = () => knownEntries.size;

async function recordEntries(owner: Owner, login: string, positions: Report["positions"], now: Date): Promise<void> {
  const unseen = positions.filter((p) => !knownEntries.has(`${owner.id}:${login}:${p.ticket}`));
  if (!unseen.length) return;
  const view = await getReasoning(now, "en").catch(() => null);
  const r = view?.reasoning;
  const rows = unseen.map((p) => ({
    userId: owner.id, login, ticket: p.ticket, side: p.side, openedAt: now, openPrice: p.openPrice, lots: p.lots,
    cBuy: r?.buy ?? 0, cSell: r?.sell ?? 0, cTotal: r ? r.buy + r.sell + r.neutral : 0,
    atrH1: r && Number.isFinite(r.atrH1) ? r.atrH1 : null, session: sessionOfUbHour(ubHour(now)),
  }));
  const fresh = await db.insert(schema.botEntries).values(rows).onConflictDoNothing().returning();
  for (const p of unseen) rememberEntry(`${owner.id}:${login}:${p.ticket}`);
  for (const e of fresh) notify(owner, tradeOpenedText(owner, e));
}

/** A robot message to its owner's Telegram. Never awaited: a slow Telegram must not hold up the robot's reply. */
function notify(owner: Owner, html: string): void {
  if (!telegramConfigured() || !owner.telegramChatId || owner.signalsPaused) return;
  deliver(owner.telegramChatId, html).catch((e) => console.error("[bot] telegram notice failed", e instanceof Error ? e.message : e));
}
const px = (n: number) => n.toFixed(2);
const usd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
export function tradeOpenedText(owner: { locale: string }, e: { side: string; lots: number; openPrice: number; cBuy: number; cSell: number; cTotal: number }): string {
  const t = translator(parseLocale(owner.locale));
  const backing = e.side === "BUY" ? e.cBuy : e.cSell;
  return [
    `${e.side === "BUY" ? "🟢" : "🔴"} <b>${t("Робот арилжаа нээлээ", "The robot opened a trade")}</b>`,
    `${esc(e.side)} ${e.lots} · ${px(e.openPrice)}`,
    e.cTotal ? t(`Чиглэлийг ${e.cTotal} аргын ${backing} нь дэмжиж байв`, `${backing} of ${e.cTotal} methods backed this side`) : "",
  ].filter(Boolean).join("\n");
}
export function tradeClosedText(owner: { locale: string }, d: { side: string; lots: number; openPrice: number; closePrice: number; profit: number }): string {
  const t = translator(parseLocale(owner.locale));
  return [
    `${d.profit >= 0 ? "✅" : "❌"} <b>${t("Робот арилжаа хаалаа", "The robot closed a trade")}</b> ${usd(d.profit)}`,
    `${esc(d.side)} ${d.lots} · ${px(d.openPrice)} → ${px(d.closePrice)}`,
  ].join("\n");
}

export type EntryBucket = { key: string; trades: number; wins: number; pnl: number };
export type EntryStats = { trades: number; byBacking: EntryBucket[]; bySession: EntryBucket[] };
/** Closed robot trades grouped by how many methods backed the side at entry, and by session. Facts, not a forecast. */
export async function getEntryStats(userId: string, login: string): Promise<EntryStats> {
  const rows = await db
    .select({ side: schema.botEntries.side, cBuy: schema.botEntries.cBuy, cSell: schema.botEntries.cSell, cTotal: schema.botEntries.cTotal, session: schema.botEntries.session, profit: schema.botDeals.profit })
    .from(schema.botDeals)
    .innerJoin(schema.botEntries, and(eq(schema.botEntries.userId, schema.botDeals.userId), eq(schema.botEntries.login, schema.botDeals.login), eq(schema.botEntries.ticket, schema.botDeals.position)))
    .where(and(eq(schema.botDeals.userId, userId), eq(schema.botDeals.login, login)));
  const add = (m: Map<string, EntryBucket>, key: string, profit: number) => {
    const b = m.get(key) ?? { key, trades: 0, wins: 0, pnl: 0 };
    b.trades++; if (profit > 0) b.wins++; b.pnl += profit;
    m.set(key, b);
  };
  const backing = new Map<string, EntryBucket>(), session = new Map<string, EntryBucket>();
  for (const r of rows) {
    const n = r.side === "BUY" ? r.cBuy : r.cSell;
    add(backing, r.cTotal === 0 ? "NONE" : n >= 11 ? "11+" : n >= 8 ? "8-10" : "0-7", r.profit);
    add(session, r.session, r.profit);
  }
  const order = ["11+", "8-10", "0-7", "NONE"];
  return { trades: rows.length, byBacking: order.map((k) => backing.get(k)).filter((b): b is EntryBucket => !!b), bySession: [...session.values()] };
}
