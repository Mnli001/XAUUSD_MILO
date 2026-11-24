import { and, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { db, schema } from "../db";
import { findUserById } from "../users";
import { recordTick } from "../feed";
import { hasAccess } from "../access";
import { mnT, type T } from "../i18n";
import { parseLocale } from "../prefs";
import { type Command, type LiveConfig, type Report, BLACKOUT_HORIZON_MS, DEFAULT_LIVE_CONFIG, blackoutWindows, commandFor, hashToken, newToken, parseConfig, parseGate, reportSchema } from "./live";
import { getReasoning } from "../reasoningLive";
import type { ConsensusCounts } from "./live";

export const ONLINE_WITHIN_MS = 15_000;

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
  const r = parseGate(input, live.config, t);
  if (!r.config) return { error: r.error };
  await update(userId, live.login, { config: r.config });
  return {};
}

/** The no-entry windows the robot is sent: stored HIGH-impact releases from `after` minutes ago to the horizon. */
/** The many-method reading as counts, when this bot waits for it. Null when it cannot be computed: the robot then holds back. */
async function consensusFor(config: LiveConfig, now: Date): Promise<ConsensusCounts | null> {
  if (!config.gate?.on || !((config.gate.minAgree ?? 0) > 0)) return null;
  try {
    const view = await getReasoning(now, "en");
    if (!view) return null;
    const { buy, sell, neutral } = view.reasoning;
    return { buy, sell, total: buy + sell + neutral };
  } catch { return null; }
}

async function blackoutsFor(config: LiveConfig, now: Date): Promise<string> {
  const g = config.gate;
  if (!g.on || (g.newsBeforeMin <= 0 && g.newsAfterMin <= 0)) return "";
  const rows = await db.select({ time: schema.economicEvents.time }).from(schema.economicEvents).where(and(
    eq(schema.economicEvents.impact, "HIGH"),
    gte(schema.economicEvents.time, new Date(now.getTime() - g.newsAfterMin * 6e4)),
    lte(schema.economicEvents.time, new Date(now.getTime() + BLACKOUT_HORIZON_MS + g.newsBeforeMin * 6e4)),
  ));
  return blackoutWindows(rows.map((r) => r.time), g.newsBeforeMin, g.newsAfterMin, now);
}

export async function startBot(userId: string, now: Date, login?: string): Promise<void> {
  const live = await getLive(userId, login);
  await update(userId, live.login, { state: "RUNNING", runId: crypto.randomUUID(), closeAll: false, startedAt: now, stoppedAt: null, stopReason: null });
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
  return token;
}

const masked = (login: string) => `••••${login.slice(-4)}`;

/** The user's MT5 accounts that have connected, most recently seen first. */
export async function listAccounts(userId: string, now: Date) {
  return (await rowsOf(userId)).filter((r) => r.login !== "").map((r) => {
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

/** The bot for the account a report comes from. A bot set up before any account connected is taken over by the first one. */
async function botForAccount(userId: string, login: string) {
  const mine = eq(schema.botLive.userId, userId);
  const [existing] = await db.select().from(schema.botLive).where(and(mine, eq(schema.botLive.login, login)));
  if (existing) return shape(existing);
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

/** One round trip with the terminal: store what it reports, answer with what it should do. null = rejected. */
export async function handleSync(token: string, body: unknown, now: Date): Promise<Command | null> {
  if (!token) return null;
  // The token picks the user: it is looked up by its hash, which is unique. The report's account picks the bot.
  const [link] = await db.select().from(schema.botTokens).where(eq(schema.botTokens.tokenHash, hashToken(token)));
  if (!link) return null;
  const owner = await findUserById(link.userId);
  if (!owner) return null;
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return null;
  const r: Report = parsed.data;
  const live = await botForAccount(owner.id, r.account.login);
  // The owner's terminal is the site's price feed: everyone's chart moves with what it reports.
  if (owner.role === "ADMIN") await recordTick({ symbol: r.symbol, bid: r.bid, ask: r.ask, server: r.account.server }, now).catch((e) => console.error("[feed] tick not kept", e));

  if (r.deals.length) {
    await db.insert(schema.botDeals).values(r.deals.map((d) => ({ ...d, userId: owner.id, login: live.login, runId: live.runId }))).onConflictDoNothing();
  }

  let { state, closeAll, stopReason } = live;
  let stoppedAt = live.stoppedAt;
  if (r.positions.length === 0) closeAll = false; // nothing left to close
  if (state === "RUNNING" && r.finished) { state = "STOPPED"; stopReason = r.finished; stoppedAt = now; }
  let cmd = commandFor({ state, runId: live.runId, closeAll, config: live.config }, r.account, r.version, parseLocale(owner.locale), await blackoutsFor(live.config, now), await consensusFor(live.config, now));
  if (cmd.state === "RUNNING" && !hasAccess(owner, now)) cmd = { ...cmd, state: "STOPPED", reason: "NO_ACCESS" };
  if (state === "RUNNING" && cmd.state === "STOPPED") { state = "STOPPED"; stopReason = cmd.reason; stoppedAt = now; }

  const { deals: _deals, account, ...rest } = r;
  void _deals;
  await update(owner.id, live.login, { state, closeAll, stopReason, stoppedAt, lastSeenAt: now, server: account.server ?? live.server, status: { ...rest, account: { ...account, login: masked(account.login) } } });
  return cmd;
}

type Status = Omit<Report, "deals">;
export type LiveView = Awaited<ReturnType<typeof getLiveView>>;

/** Everything the control page shows. */
export async function getLiveView(userId: string, now: Date, login?: string) {
  const live = await getLive(userId, login);
  const mine = and(eq(schema.botDeals.userId, userId), eq(schema.botDeals.login, live.login));
  const [link] = await db.select().from(schema.botTokens).where(eq(schema.botTokens.userId, userId));
  const status = live.status as Status | null;
  const deals = await db.select().from(schema.botDeals).where(mine).orderBy(desc(schema.botDeals.closeTime)).limit(50);
  const [{ total }] = await db.select({ total: sum(schema.botDeals.profit) }).from(schema.botDeals).where(and(mine, gte(schema.botDeals.closeTime, new Date(now.getTime() - 864e5))));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.botDeals).where(mine);
  return {
    account: live.login,
    accounts: await listAccounts(userId, now),
    accountServer: live.server,
    state: live.state,
    stopReason: live.stopReason,
    startedAt: live.startedAt,
    stoppedAt: live.stoppedAt,
    closeAllPending: live.closeAll,
    config: live.config,
    hasToken: !!link?.tokenHash,
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
    deals,
    dealCount: n,
    pnl24h: Number(total ?? 0),
  };
}
