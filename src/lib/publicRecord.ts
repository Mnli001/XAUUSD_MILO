import { and, asc, eq, gte, sum } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { findUserById } from "./users";
import { ubDateKey, ubLocalToUtc } from "./time";
import { mnT, type T } from "./i18n";

/**
 * The site's public "live record": the closed trades of ONE robot account the owner picked (one of an admin's own
 * MT5 accounts), from a start date on. The choice lives in app_state under PUBLIC_RECORD_KEY. What leaves this module
 * is figures only: never the account login, the owner's id or email, a ticket or a token.
 */
export const PUBLIC_RECORD_KEY = "public_record";

const settingSchema = z.object({
  userId: z.string().min(1),
  login: z.string().min(1),
  since: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  startBalance: z.number().finite().positive(),
});
export type PublicRecordSetting = z.infer<typeof settingSchema>;

export type RecordDeal = { closeTime: Date; side: string; lots: number; openPrice: number; closePrice: number; profit: number };
export type RecordTrade = { time: string; side: "BUY" | "SELL"; lots: number; entry: number; exit: number; profit: number };
export type RecordStats = {
  trades: number;
  wins: number;
  winRate: number; // % of closed trades with a profit
  profit: number; // $ summed over the closed trades
  returnPct: number; // profit as a % of the balance at the start
  maxDrawdownPct: number; // the deepest fall of the closed balance from its high, in % (a positive number)
  series: { day: string; balance: number }[]; // closed balance at the end of each UB day, start day to today
  lastTrades: RecordTrade[]; // newest first, at most LAST_TRADES
};
export type PublicRecord = RecordStats & {
  mode: "DEMO" | "REAL";
  since: string; // ISO instant the record counts from
  sinceDay: string; // the same, as a UB date (YYYY-MM-DD)
  daysRunning: number;
  startBalance: number;
  currency: string;
  updatedAt: string; // ISO: when these figures were worked out
};

export const LAST_TRADES = 10;
const CACHE_MS = process.env.NODE_ENV === "test" ? 0 : 60_000;
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const DAY_MS = 864e5;

/** Every day from one UB date to another, both included. */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); d <= end && out.length < 3700; d += DAY_MS) out.push(new Date(d).toISOString().slice(0, 10));
  return out;
}

/** The record's figures from its closed deals. Pure: the tests feed it fixed deals. */
export function computeRecordStats(deals: RecordDeal[], startBalance: number, since: Date, now: Date): RecordStats {
  const sorted = deals.filter((d) => d.closeTime >= since && d.closeTime <= now).sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
  let balance = startBalance, peak = startBalance, maxDD = 0, wins = 0;
  const endOfDay = new Map<string, number>();
  for (const d of sorted) {
    balance += d.profit;
    if (d.profit > 0) wins++;
    peak = Math.max(peak, balance);
    if (peak > 0) maxDD = Math.max(maxDD, (peak - balance) / peak);
    endOfDay.set(ubDateKey(d.closeTime), balance);
  }
  let carry = startBalance;
  const series = daysBetween(ubDateKey(since), ubDateKey(now)).map((day) => {
    carry = endOfDay.get(day) ?? carry;
    return { day, balance: round(carry) };
  });
  const profit = balance - startBalance;
  return {
    trades: sorted.length,
    wins,
    winRate: sorted.length ? round((wins / sorted.length) * 100, 1) : 0,
    profit: round(profit),
    returnPct: startBalance > 0 ? round((profit / startBalance) * 100) : 0,
    maxDrawdownPct: round(maxDD * 100),
    series,
    lastTrades: sorted.slice(-LAST_TRADES).reverse().map((d) => ({
      time: d.closeTime.toISOString(),
      side: d.side === "SELL" ? "SELL" : "BUY",
      lots: d.lots,
      entry: d.openPrice,
      exit: d.closePrice,
      profit: round(d.profit),
    })),
  };
}

// ---- The setting ----

export async function readPublicRecordSetting(): Promise<PublicRecordSetting | null> {
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, PUBLIC_RECORD_KEY)).limit(1);
  if (!row) return null;
  try {
    const parsed = settingSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

async function assertAdmin(adminId: string) {
  const a = await findUserById(adminId);
  if (!a || a.role !== "ADMIN") throw new Error("admin only");
  return a;
}

type Status = { account?: { mode?: string; balance?: number; currency?: string } } | null;
const modeOf = (status: unknown): "DEMO" | "REAL" => ((status as Status)?.account?.mode === "REAL" ? "REAL" : "DEMO");

/**
 * Makes one of the admin's own robot accounts the public record, counting from `sinceDay` (a UB date; today when
 * empty). The balance at the start is the account's last reported balance less what it has closed since then.
 */
export async function setPublicRecord(adminId: string, login: string, sinceDay: string, now: Date, t: T = mnT): Promise<{ error?: string }> {
  await assertAdmin(adminId);
  const day = sinceDay.trim() || ubDateKey(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { error: t("Огноо буруу байна", "Invalid date") };
  if (day > ubDateKey(now)) return { error: t("Эхлэх огноо ирээдүйд байж болохгүй", "The start date cannot be in the future") };
  const since = ubLocalToUtc(day, "00:00");
  if (!login) return { error: t("Данс сонгоно уу", "Choose an account") };
  const [bot] = await db.select().from(schema.botLive).where(and(eq(schema.botLive.userId, adminId), eq(schema.botLive.login, login)));
  if (!bot) return { error: t("Энэ данс таных биш эсвэл robot холбогдоогүй байна", "This account is not yours or no robot has connected from it") };
  const balance = (bot.status as Status)?.account?.balance;
  if (typeof balance !== "number" || !Number.isFinite(balance)) return { error: t("Энэ данснаас robot balance мэдээлээгүй байна. Robot-оо асаагаад дахин оролдоно уу.", "The robot has not reported a balance from this account yet. Turn the robot on and try again.") };
  const [{ closed }] = await db.select({ closed: sum(schema.botDeals.profit) }).from(schema.botDeals)
    .where(and(eq(schema.botDeals.userId, adminId), eq(schema.botDeals.login, login), gte(schema.botDeals.closeTime, since)));
  const startBalance = round(balance - Number(closed ?? 0));
  if (!(startBalance > 0)) return { error: t("Эхлэх balance тооцоолж чадсангүй", "Could not work out the starting balance") };
  const value: PublicRecordSetting = { userId: adminId, login, since: since.toISOString(), startBalance };
  await db.insert(schema.appState).values({ key: PUBLIC_RECORD_KEY, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value: JSON.stringify(value), updatedAt: now } });
  forgetPublicRecord();
  return {};
}

export async function clearPublicRecord(adminId: string): Promise<void> {
  await assertAdmin(adminId);
  await db.delete(schema.appState).where(eq(schema.appState.key, PUBLIC_RECORD_KEY));
  forgetPublicRecord();
}

// ---- What the public sees ----

let memo: { at: number; value: PublicRecord | null } | null = null;
export const forgetPublicRecord = () => { memo = null; };

async function buildPublicRecord(now: Date): Promise<PublicRecord | null> {
  const s = await readPublicRecordSetting();
  if (!s) return null;
  const [bot] = await db.select({ status: schema.botLive.status }).from(schema.botLive).where(and(eq(schema.botLive.userId, s.userId), eq(schema.botLive.login, s.login)));
  if (!bot) return null;
  const owner = await findUserById(s.userId);
  if (!owner || owner.role !== "ADMIN") return null; // only the owner's own robot may speak for the system
  const since = new Date(s.since);
  const deals = await db
    .select({ closeTime: schema.botDeals.closeTime, side: schema.botDeals.side, lots: schema.botDeals.lots, openPrice: schema.botDeals.openPrice, closePrice: schema.botDeals.closePrice, profit: schema.botDeals.profit })
    .from(schema.botDeals)
    .where(and(eq(schema.botDeals.userId, s.userId), eq(schema.botDeals.login, s.login), gte(schema.botDeals.closeTime, since)))
    .orderBy(asc(schema.botDeals.closeTime));
  const sinceDay = ubDateKey(since);
  const currency = (bot.status as Status)?.account?.currency;
  return {
    mode: modeOf(bot.status),
    since: since.toISOString(),
    sinceDay,
    daysRunning: Math.max(1, daysBetween(sinceDay, ubDateKey(now)).length),
    startBalance: s.startBalance,
    currency: typeof currency === "string" && /^[A-Za-z]{2,10}$/.test(currency) ? currency : "USD",
    updatedAt: now.toISOString(),
    ...computeRecordStats(deals, s.startBalance, since, now),
  };
}

/** The public record, worked out at most once a minute. Null when no account is chosen. */
export async function getPublicRecord(now: Date = new Date()): Promise<PublicRecord | null> {
  if (memo && Date.now() - memo.at < CACHE_MS) return memo.value;
  const value = await buildPublicRecord(now);
  memo = { at: Date.now(), value };
  return value;
}

/** The admin page's view of the setting: which account, shown masked. */
export async function publicRecordAdminView(adminId: string) {
  await assertAdmin(adminId);
  const s = await readPublicRecordSetting();
  if (!s) return null;
  const [bot] = await db.select({ server: schema.botLive.server, status: schema.botLive.status }).from(schema.botLive).where(and(eq(schema.botLive.userId, s.userId), eq(schema.botLive.login, s.login)));
  const masked = `••••${s.login.slice(-4)}`;
  return { mine: s.userId === adminId, login: s.login, label: bot?.server ? `${bot.server} · ${masked}` : masked, mode: bot ? modeOf(bot.status) : null, since: new Date(s.since), startBalance: s.startBalance, found: !!bot };
}
