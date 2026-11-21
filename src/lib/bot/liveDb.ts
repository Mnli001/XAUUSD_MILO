import { timingSafeEqual } from "node:crypto";
import { desc, eq, gte, sql, sum } from "drizzle-orm";
import { db, schema } from "../db";
import { findUserById } from "../users";
import { type Command, type LiveConfig, type Report, DEFAULT_LIVE_CONFIG, commandFor, hashToken, newToken, parseConfig, reportSchema } from "./live";

const ID = "main";
export const ONLINE_WITHIN_MS = 15_000;

async function assertAdmin(adminId: string) {
  const a = await findUserById(adminId);
  if (!a || a.role !== "ADMIN") throw new Error("Админ эрх шаардлагатай");
}

export async function getLive() {
  await db.insert(schema.botLive).values({ id: ID, config: DEFAULT_LIVE_CONFIG }).onConflictDoNothing({ target: schema.botLive.id });
  const [row] = await db.select().from(schema.botLive).where(eq(schema.botLive.id, ID));
  return { ...row, state: row.state as "RUNNING" | "STOPPED", config: { ...DEFAULT_LIVE_CONFIG, ...(row.config as Partial<LiveConfig>) } };
}

const update = (set: Partial<typeof schema.botLive.$inferInsert>) => db.update(schema.botLive).set(set).where(eq(schema.botLive.id, ID));

export async function saveLiveConfig(adminId: string, input: unknown): Promise<{ error?: string }> {
  await assertAdmin(adminId);
  const r = parseConfig(input);
  if (!r.config) return { error: r.error };
  await getLive();
  await update({ config: r.config });
  return {};
}

export async function startBot(adminId: string, now: Date): Promise<void> {
  await assertAdmin(adminId);
  await getLive();
  await update({ state: "RUNNING", runId: crypto.randomUUID(), closeAll: false, startedAt: now, stoppedAt: null, stopReason: null });
}

/** Stopping also asks the terminal to close the bot's open positions. */
export async function stopBot(adminId: string, reason: string, now: Date): Promise<void> {
  await assertAdmin(adminId);
  await getLive();
  await update({ state: "STOPPED", closeAll: true, stoppedAt: now, stopReason: reason });
}

export async function requestCloseAll(adminId: string): Promise<void> {
  await assertAdmin(adminId);
  await getLive();
  await update({ closeAll: true });
}

/** Returns the new token once; only its hash is kept. The previous token stops working. */
export async function rotateToken(adminId: string): Promise<string> {
  await assertAdmin(adminId);
  await getLive();
  const token = newToken();
  await update({ tokenHash: hashToken(token) });
  return token;
}

function tokenMatches(given: string, storedHash: string | null): boolean {
  if (!given || !storedHash) return false;
  const a = Buffer.from(hashToken(given));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** One round trip with the terminal: store what it reports, answer with what it should do. null = rejected. */
export async function handleSync(token: string, body: unknown, now: Date): Promise<Command | null> {
  const live = await getLive();
  if (!tokenMatches(token, live.tokenHash)) return null;
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return null;
  const r: Report = parsed.data;

  if (r.deals.length) {
    await db.insert(schema.botDeals).values(r.deals.map((d) => ({ ...d, runId: live.runId }))).onConflictDoNothing({ target: schema.botDeals.ticket });
  }

  let { state, closeAll, stopReason } = live;
  let stoppedAt = live.stoppedAt;
  if (r.positions.length === 0) closeAll = false; // nothing left to close
  if (state === "RUNNING" && r.finished) { state = "STOPPED"; stopReason = r.finished; stoppedAt = now; }
  const cmd = commandFor({ state, runId: live.runId, closeAll, config: live.config }, r.account);
  if (state === "RUNNING" && cmd.state === "STOPPED") { state = "STOPPED"; stopReason = cmd.reason; stoppedAt = now; }

  const { deals: _deals, account, ...rest } = r;
  void _deals;
  await update({ state, closeAll, stopReason, stoppedAt, lastSeenAt: now, status: { ...rest, account: { ...account, login: `••••${account.login.slice(-4)}` } } });
  return cmd;
}

type Status = Omit<Report, "deals">;
export type LiveView = Awaited<ReturnType<typeof getLiveView>>;

/** Everything the control page shows. */
export async function getLiveView(now: Date) {
  const live = await getLive();
  const status = live.status as Status | null;
  const deals = await db.select().from(schema.botDeals).orderBy(desc(schema.botDeals.closeTime)).limit(50);
  const [{ total }] = await db.select({ total: sum(schema.botDeals.profit) }).from(schema.botDeals).where(gte(schema.botDeals.closeTime, new Date(now.getTime() - 864e5)));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.botDeals);
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
    plannedSeconds: status?.plannedSeconds ?? null,
    elapsedSeconds: status?.elapsedSeconds ?? null,
    positions: status?.positions ?? [],
    deals,
    dealCount: n,
    pnl24h: Number(total ?? 0),
  };
}
