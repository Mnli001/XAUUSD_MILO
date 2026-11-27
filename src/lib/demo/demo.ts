import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { DemoAccount, DemoOrder } from "../db/schema";
import {
  BALANCE_MAX, BALANCE_MIN, LEVERAGES, accountState, checkExits, closePriceFor, openPriceFor, pnl, stopOutVictims, validLots, validateOrder,
  marginFor, type OrderError, type OrderInput, type Price, type Side,
} from "./engine";

export const MAX_DEMO_ACCOUNTS = 3;
export const NOTE_MAX = 300;
const o = schema.demoOrders, a = schema.demoAccounts;
const r2 = (n: number) => Math.round(n * 100) / 100;
const side = (s: string): Side => (s === "SELL" ? "SELL" : "BUY");
type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type OpenInput = { name: string; balance: number; leverage: number; beginner: boolean };

export async function openDemoAccount(userId: string, input: OpenInput, now: Date): Promise<{ account?: DemoAccount; error?: "name" | "balance" | "leverage" | "max" }> {
  const name = input.name.trim().slice(0, 40);
  if (!name) return { error: "name" };
  if (!(input.balance >= BALANCE_MIN && input.balance <= BALANCE_MAX)) return { error: "balance" };
  if (!(LEVERAGES as readonly number[]).includes(input.leverage)) return { error: "leverage" };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(a).where(eq(a.userId, userId));
  if (n >= MAX_DEMO_ACCOUNTS) return { error: "max" };
  const balance = r2(input.balance);
  const [account] = await db.insert(a).values({ userId, name, leverage: input.leverage, balance, startBalance: balance, beginner: input.beginner, createdAt: now }).returning();
  await db.insert(schema.demoCash).values({ accountId: account.id, kind: "OPEN", amount: balance, balanceAfter: balance, at: now });
  return { account };
}

export const listDemoAccounts = (userId: string) => db.select().from(a).where(eq(a.userId, userId)).orderBy(asc(a.createdAt));

async function ownAccount(userId: string, accountId: string): Promise<DemoAccount | null> {
  const [row] = await db.select().from(a).where(and(eq(a.id, accountId), eq(a.userId, userId)));
  return row ?? null;
}

export async function deleteDemoAccount(userId: string, accountId: string): Promise<boolean> {
  return (await db.delete(a).where(and(eq(a.id, accountId), eq(a.userId, userId))).returning({ id: a.id })).length > 0;
}

export async function renameDemoAccount(userId: string, accountId: string, name: string, beginner: boolean): Promise<boolean> {
  const n = name.trim().slice(0, 40);
  if (!n) return false;
  return (await db.update(a).set({ name: n, beginner }).where(and(eq(a.id, accountId), eq(a.userId, userId))).returning({ id: a.id })).length > 0;
}

const openOf = (accountId: string, x: Db | Tx = db) => x.select().from(o).where(and(eq(o.accountId, accountId), eq(o.status, "OPEN")));
const held = (rows: DemoOrder[]) => rows.map((r) => ({ id: r.id, side: side(r.side), lots: r.lots, openPrice: r.openPrice! }));

/**
 * Closes an open position (or `lots` of it) at `price`, once: a position someone else closed a moment earlier is
 * left alone. The result goes to the balance in the same transaction.
 */
async function closeAt(id: string, p: Price, reason: string, now: Date, lots?: number): Promise<DemoOrder | null> {
  return db.transaction(async (tx) => {
    const [pos] = await tx.select().from(o).where(and(eq(o.id, id), eq(o.status, "OPEN"))).for("update");
    if (!pos) return null;
    const s = side(pos.side);
    const close = closePriceFor(s, p);
    const part = lots !== undefined && lots < pos.lots - 1e-9 ? lots : pos.lots;
    const profit = pnl(s, part, pos.openPrice!, close);
    let closed: DemoOrder;
    if (part < pos.lots) {
      await tx.update(o).set({ lots: r2(pos.lots - part) }).where(eq(o.id, id));
      [closed] = await tx.insert(o).values({
        accountId: pos.accountId, userId: pos.userId, side: pos.side, type: pos.type, status: "CLOSED", lots: part, price: pos.price, openPrice: pos.openPrice,
        openedAt: pos.openedAt, sl: pos.sl, tp: pos.tp, closePrice: close, closedAt: now, closeReason: reason, profit, note: pos.note, createdAt: pos.createdAt,
      }).returning();
    } else {
      [closed] = await tx.update(o).set({ status: "CLOSED", closePrice: close, closedAt: now, closeReason: reason, profit }).where(eq(o.id, id)).returning();
    }
    await tx.update(a).set({ balance: sql`round((${a.balance} + ${profit})::numeric, 2)::float8` }).where(eq(a.id, pos.accountId));
    return closed;
  });
}

/** Pending orders that reached their price, stops and targets, then stop-outs: on every account, or one. */
async function runChecks(p: Price, now: Date, accountId?: string): Promise<{ filled: number; closed: number }> {
  let filled = 0, closed = 0;
  const scope = accountId ? [eq(o.accountId, accountId)] : [];
  const pending = await db.select().from(o).where(and(eq(o.status, "PENDING"), ...scope, sql`(
    (${o.side} = 'BUY' AND ${o.type} = 'LIMIT' AND ${o.price} >= ${p.ask}) OR (${o.side} = 'BUY' AND ${o.type} = 'STOP' AND ${o.price} <= ${p.ask}) OR
    (${o.side} = 'SELL' AND ${o.type} = 'LIMIT' AND ${o.price} <= ${p.bid}) OR (${o.side} = 'SELL' AND ${o.type} = 'STOP' AND ${o.price} >= ${p.bid}))`)).orderBy(asc(o.createdAt));
  for (const ord of pending) {
    const done = await db.transaction(async (tx) => {
      const [acct] = await tx.select().from(a).where(eq(a.id, ord.accountId)).for("update");
      const [still] = await tx.select().from(o).where(and(eq(o.id, ord.id), eq(o.status, "PENDING")));
      if (!acct || !still) return false;
      const s = side(ord.side);
      const fill = openPriceFor(s, p);
      const st = accountState(acct.balance, acct.leverage, held(await openOf(acct.id, tx)), p);
      if (marginFor(ord.lots, fill, acct.leverage) > st.free) {
        await tx.update(o).set({ status: "CANCELLED", closedAt: now, closeReason: "MARGIN" }).where(eq(o.id, ord.id));
        return false;
      }
      await tx.update(o).set({ status: "OPEN", openPrice: fill, openedAt: now }).where(eq(o.id, ord.id));
      return true;
    });
    if (done) filled++;
  }
  const hits = await db.select({ id: o.id, side: o.side, sl: o.sl, tp: o.tp }).from(o).where(and(eq(o.status, "OPEN"), ...scope, sql`(
    (${o.side} = 'BUY' AND ((${o.sl} IS NOT NULL AND ${o.sl} >= ${p.bid}) OR (${o.tp} IS NOT NULL AND ${o.tp} <= ${p.bid}))) OR
    (${o.side} = 'SELL' AND ((${o.sl} IS NOT NULL AND ${o.sl} <= ${p.ask}) OR (${o.tp} IS NOT NULL AND ${o.tp} >= ${p.ask}))))`));
  for (const h of hits) {
    const c = closePriceFor(side(h.side), p);
    const reason = h.sl !== null && (h.side === "BUY" ? c <= h.sl : c >= h.sl) ? "SL" : "TP";
    if (await closeAt(h.id, p, reason, now)) closed++;
  }
  // Stop-out: accounts holding positions whose margin level is under 50%.
  const open = await db.select().from(o).where(and(eq(o.status, "OPEN"), ...scope));
  const byAccount = new Map<string, DemoOrder[]>();
  for (const r of open) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), r]);
  if (byAccount.size) {
    const accts = await db.select().from(a).where(inArray(a.id, [...byAccount.keys()]));
    for (const acct of accts) {
      for (const id of stopOutVictims(acct.balance, acct.leverage, held(byAccount.get(acct.id)!), p)) {
        if (await closeAt(id, p, "STOPOUT", now)) closed++;
      }
    }
  }
  return { filled, closed };
}

let lastRun = 0;
let running = false;
/** The live price's work on every demo account; called with each tick, at most once every two seconds. */
export async function processDemoTick(p: Price, now: Date, opts: { throttle?: boolean } = {}) {
  if (opts.throttle) {
    if (running || now.getTime() - lastRun < 2000) return null;
    lastRun = now.getTime();
  }
  running = true;
  try { return await runChecks(p, now); } finally { running = false; }
}

export type PlaceInput = OrderInput & { note?: string | null };

export async function placeDemoOrder(userId: string, accountId: string, input: PlaceInput, p: Price | null, now: Date): Promise<{ order?: DemoOrder; error?: OrderError | "account" }> {
  const acct = await ownAccount(userId, accountId);
  if (!acct) return { error: "account" };
  if (p) await runChecks(p, now, accountId);
  const fresh = (await ownAccount(userId, accountId))!;
  const positions = held(await openOf(accountId));
  const err = validateOrder(input, p, { balance: fresh.balance, leverage: fresh.leverage, positions });
  if (err) return { error: err };
  const s = input.side;
  const note = input.note?.trim().slice(0, NOTE_MAX) || null;
  const base = { accountId, userId, side: s, type: input.type, lots: input.lots, sl: input.sl ?? null, tp: input.tp ?? null, note, createdAt: now };
  const [order] = input.type === "MARKET"
    ? await db.insert(o).values({ ...base, status: "OPEN", openPrice: openPriceFor(s, p!), openedAt: now }).returning()
    : await db.insert(o).values({ ...base, status: "PENDING", price: input.price! }).returning();
  return { order };
}

/** A new stop and target (null clears one), and for a pending order a new price. */
export async function modifyDemoOrder(userId: string, orderId: string, ch: { sl: number | null; tp: number | null; price?: number | null }, p: Price | null): Promise<{ order?: DemoOrder; error?: "order" | "closed" | "sl" | "tp" | "price" }> {
  const [ord] = await db.select().from(o).where(and(eq(o.id, orderId), eq(o.userId, userId), inArray(o.status, ["OPEN", "PENDING"])));
  if (!ord) return { error: "order" };
  if (!p) return { error: "closed" };
  const s = side(ord.side);
  if (ord.status === "OPEN") {
    const bad = checkExits(s, closePriceFor(s, p), ch.sl, ch.tp);
    if (bad) return { error: bad };
    const [order] = await db.update(o).set({ sl: ch.sl, tp: ch.tp }).where(and(eq(o.id, orderId), eq(o.status, "OPEN"))).returning();
    return order ? { order } : { error: "order" };
  }
  const price = ch.price ?? ord.price!;
  const ok = s === "BUY" ? (ord.type === "LIMIT" ? price < p.ask : price > p.ask) : (ord.type === "LIMIT" ? price > p.bid : price < p.bid);
  if (!(price > 0) || !ok) return { error: "price" };
  const bad = checkExits(s, price, ch.sl, ch.tp);
  if (bad) return { error: bad };
  const [order] = await db.update(o).set({ sl: ch.sl, tp: ch.tp, price }).where(and(eq(o.id, orderId), eq(o.status, "PENDING"))).returning();
  return order ? { order } : { error: "order" };
}

export async function closeDemoPosition(userId: string, orderId: string, p: Price | null, now: Date, lots?: number): Promise<{ closed?: DemoOrder; error?: "order" | "closed" | "lots" }> {
  const [pos] = await db.select().from(o).where(and(eq(o.id, orderId), eq(o.userId, userId), eq(o.status, "OPEN")));
  if (!pos) return { error: "order" };
  if (!p) return { error: "closed" };
  if (lots !== undefined && (!validLots(lots) || lots > pos.lots + 1e-9)) return { error: "lots" };
  const closed = await closeAt(orderId, p, "MANUAL", now, lots);
  return closed ? { closed } : { error: "order" };
}

export async function cancelDemoOrder(userId: string, orderId: string): Promise<boolean> {
  return (await db.update(o).set({ status: "CANCELLED", closedAt: new Date(), closeReason: "MANUAL" }).where(and(eq(o.id, orderId), eq(o.userId, userId), eq(o.status, "PENDING"))).returning({ id: o.id })).length > 0;
}

/** Closes every open position on the account; returns how many. */
export async function closeAllDemo(userId: string, accountId: string, p: Price | null, now: Date): Promise<number> {
  if (!p || !(await ownAccount(userId, accountId))) return 0;
  let n = 0;
  for (const pos of await openOf(accountId)) if (await closeAt(pos.id, p, "MANUAL", now)) n++;
  return n;
}

/** Money in, money out (never past the free margin), or a fresh start with a new balance. */
export async function adjustDemoBalance(userId: string, accountId: string, kind: "DEPOSIT" | "WITHDRAW" | "RESET", amount: number, p: Price | null, now: Date): Promise<{ account?: DemoAccount; error?: "account" | "amount" | "free" }> {
  const acct = await ownAccount(userId, accountId);
  if (!acct) return { error: "account" };
  if (!(amount > 0) || amount > BALANCE_MAX) return { error: "amount" };
  const amt = r2(amount);
  if (kind === "RESET") {
    if (amt < BALANCE_MIN) return { error: "amount" };
    const account = await db.transaction(async (tx) => {
      await tx.delete(o).where(eq(o.accountId, accountId));
      await tx.delete(schema.demoCash).where(eq(schema.demoCash.accountId, accountId));
      const [row] = await tx.update(a).set({ balance: amt, startBalance: amt }).where(eq(a.id, accountId)).returning();
      await tx.insert(schema.demoCash).values({ accountId, kind: "RESET", amount: amt, balanceAfter: amt, at: now });
      return row;
    });
    return { account };
  }
  const account = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(a).where(eq(a.id, accountId)).for("update");
    if (kind === "WITHDRAW") {
      const st = accountState(row.balance, row.leverage, held(await openOf(accountId, tx)), p);
      if (amt > (p ? st.free : row.balance - st.margin)) return null;
    } else if (row.balance + amt > BALANCE_MAX) return null;
    const balance = r2(row.balance + (kind === "DEPOSIT" ? amt : -amt));
    const [next] = await tx.update(a).set({ balance }).where(eq(a.id, accountId)).returning();
    await tx.insert(schema.demoCash).values({ accountId, kind, amount: amt, balanceAfter: balance, at: now });
    return next;
  });
  return account ? { account } : { error: kind === "WITHDRAW" ? "free" : "amount" };
}

/** Everything the terminal shows for one account. Runs the price's checks first so it is never behind. */
export async function demoState(userId: string, accountId: string, p: Price | null, now = new Date()) {
  if (!(await ownAccount(userId, accountId))) return null;
  if (p) await runChecks(p, now, accountId);
  const account = (await ownAccount(userId, accountId))!;
  const rows = await db.select().from(o).where(and(eq(o.accountId, accountId), inArray(o.status, ["OPEN", "PENDING"]))).orderBy(desc(o.createdAt));
  const history = await db.select().from(o).where(and(eq(o.accountId, accountId), eq(o.status, "CLOSED"))).orderBy(desc(o.closedAt)).limit(500);
  const cash = await db.select().from(schema.demoCash).where(eq(schema.demoCash.accountId, accountId)).orderBy(desc(schema.demoCash.at)).limit(50);
  const positions = rows.filter((r) => r.status === "OPEN");
  return { account, state: accountState(account.balance, account.leverage, held(positions), p), positions, pending: rows.filter((r) => r.status === "PENDING"), history, cash };
}
export type DemoStateData = NonNullable<Awaited<ReturnType<typeof demoState>>>;

export type MissionId = "sl" | "pending" | "tp" | "breakeven" | "partial" | "notes" | "smallRisk";
export const MISSION_GOAL: Record<MissionId, number> = { sl: 1, pending: 1, tp: 1, breakeven: 1, partial: 1, notes: 3, smallRisk: 5 };

/** The beginner's steps, counted from what the member has done on this account (the parts of a partly closed position count once). */
export async function demoMissions(accountId: string, startBalance: number): Promise<{ id: MissionId; count: number; goal: number }[]> {
  const res = await db.execute(sql`SELECT
    count(*) FILTER (WHERE type = 'MARKET' AND sl IS NOT NULL AND status <> 'PENDING')::int AS sl,
    count(*) FILTER (WHERE type IN ('LIMIT', 'STOP'))::int AS pending,
    count(*) FILTER (WHERE close_reason = 'TP')::int AS tp,
    count(*) FILTER (WHERE open_price IS NOT NULL AND sl IS NOT NULL AND ((side = 'BUY' AND sl >= open_price) OR (side = 'SELL' AND sl <= open_price)))::int AS breakeven,
    count(DISTINCT coalesce(opened_at::text || open_price::text, id)) FILTER (WHERE note IS NOT NULL)::int AS notes,
    count(DISTINCT opened_at::text || open_price::text) FILTER (WHERE status = 'CLOSED' AND sl IS NOT NULL AND abs(open_price - sl) * lots * 100 <= ${startBalance * 0.01})::int AS "smallRisk",
    (SELECT count(*)::int FROM (SELECT 1 FROM demo_orders d WHERE d.account_id = ${accountId} AND d.opened_at IS NOT NULL GROUP BY d.opened_at, d.open_price HAVING count(*) > 1) x) AS partial
    FROM demo_orders WHERE account_id = ${accountId}`);
  const row = (res.rows[0] ?? {}) as Record<MissionId, number>;
  return (Object.keys(MISSION_GOAL) as MissionId[]).map((id) => ({ id, count: Math.min(Number(row[id] ?? 0), MISSION_GOAL[id]), goal: MISSION_GOAL[id] }));
}
