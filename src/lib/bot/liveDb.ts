import { and, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db, schema } from "../db";
import { findUserById } from "../users";
import { hasAccess } from "../access";
import { mnT, type T } from "../i18n";
import { parseLocale } from "../prefs";
import { type Command, type LiveConfig, type Report, DEFAULT_LIVE_CONFIG, commandFor, hashToken, newToken, parseConfig, reportSchema } from "./live";

export const ONLINE_WITHIN_MS = 15_000;

/** A user's own bot row, created on first use. Callers check that the user may use the system. */
export async function getLive(userId: string) {
  await db.insert(schema.botLive).values({ userId, config: DEFAULT_LIVE_CONFIG }).onConflictDoNothing({ target: schema.botLive.userId });
  const [row] = await db.select().from(schema.botLive).where(eq(schema.botLive.userId, userId));
  return shape(row);
}
const shape = (row: typeof schema.botLive.$inferSelect) => {
  const stored = row.config as Partial<LiveConfig>;
  return { ...row, state: row.state as "RUNNING" | "STOPPED", config: { ...DEFAULT_LIVE_CONFIG, ...stored, basket: { ...DEFAULT_LIVE_CONFIG.basket, ...stored.basket }, rule: { ...DEFAULT_LIVE_CONFIG.rule, ...stored.rule } } };
};

const update = (userId: string, set: Partial<typeof schema.botLive.$inferInsert>) => db.update(schema.botLive).set(set).where(eq(schema.botLive.userId, userId));

export async function saveLiveConfig(userId: string, input: unknown, t: T = mnT): Promise<{ error?: string }> {
  const r = parseConfig(input, (await getLive(userId)).config, t);
  if (!r.config) return { error: r.error };
  await update(userId, { config: r.config });
  return {};
}

export async function startBot(userId: string, now: Date): Promise<void> {
  await getLive(userId);
  await update(userId, { state: "RUNNING", runId: crypto.randomUUID(), closeAll: false, startedAt: now, stoppedAt: null, stopReason: null });
}

/** Stopping also asks the terminal to close the bot's open positions. */
export async function stopBot(userId: string, reason: string, now: Date): Promise<void> {
  await getLive(userId);
  await update(userId, { state: "STOPPED", closeAll: true, stoppedAt: now, stopReason: reason });
}

export async function requestCloseAll(userId: string): Promise<void> {
  await getLive(userId);
  await update(userId, { closeAll: true });
}

/** Returns the new token once; only its hash is kept. The previous token stops working. */
export async function rotateToken(userId: string): Promise<string> {
  await getLive(userId);
  const token = newToken();
  await update(userId, { tokenHash: hashToken(token) });
  return token;
}

/** One round trip with the terminal: store what it reports, answer with what it should do. null = rejected. */
export async function handleSync(token: string, body: unknown, now: Date): Promise<Command | null> {
  if (!token) return null;
  // The token picks the bot: it is looked up by its hash, which is unique.
  const [row] = await db.select().from(schema.botLive).where(eq(schema.botLive.tokenHash, hashToken(token)));
  if (!row) return null;
  const live = shape(row);
  const owner = await findUserById(live.userId);
  if (!owner) return null;
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return null;
  const r: Report = parsed.data;

  if (r.deals.length) {
    await db.insert(schema.botDeals).values(r.deals.map((d) => ({ ...d, userId: live.userId, runId: live.runId }))).onConflictDoNothing({ target: [schema.botDeals.userId, schema.botDeals.ticket] });
  }

  let { state, closeAll, stopReason } = live;
  let stoppedAt = live.stoppedAt;
  if (r.positions.length === 0) closeAll = false; // nothing left to close
  if (state === "RUNNING" && r.finished) { state = "STOPPED"; stopReason = r.finished; stoppedAt = now; }
  let cmd = commandFor({ state, runId: live.runId, closeAll, config: live.config }, r.account, r.version, parseLocale(owner.locale));
  if (cmd.state === "RUNNING" && !hasAccess(owner, now)) cmd = { ...cmd, state: "STOPPED", reason: "NO_ACCESS" };
  if (state === "RUNNING" && cmd.state === "STOPPED") { state = "STOPPED"; stopReason = cmd.reason; stoppedAt = now; }

  const { deals: _deals, account, ...rest } = r;
  void _deals;
  await update(live.userId, { state, closeAll, stopReason, stoppedAt, lastSeenAt: now, status: { ...rest, account: { ...account, login: `••••${account.login.slice(-4)}` } } });
  return cmd;
}

type Status = Omit<Report, "deals">;
export type LiveView = Awaited<ReturnType<typeof getLiveView>>;

/** Everything the control page shows. */
export async function getLiveView(userId: string, now: Date) {
  const live = await getLive(userId);
  const mine = eq(schema.botDeals.userId, userId);
  const status = live.status as Status | null;
  const deals = await db.select().from(schema.botDeals).where(mine).orderBy(desc(schema.botDeals.closeTime)).limit(50);
  const [{ total }] = await db.select({ total: sum(schema.botDeals.profit) }).from(schema.botDeals).where(and(mine, gte(schema.botDeals.closeTime, new Date(now.getTime() - 864e5))));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.botDeals).where(mine);
  return {
    state: live.state,
    stopReason: live.stopReason,
    startedAt: live.startedAt,
    stoppedAt: live.stoppedAt,
    closeAllPending: live.closeAll,
    config: live.config,
    hasToken: !!live.tokenHash,
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
    deals,
    dealCount: n,
    pnl24h: Number(total ?? 0),
  };
}
