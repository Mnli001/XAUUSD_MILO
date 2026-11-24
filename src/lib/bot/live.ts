import { createHash, randomBytes } from "node:crypto";
import { mnT, type Locale, type T } from "../i18n";
import { z } from "zod";

/**
 * What the owner sets on the web. Lot size is theirs to choose; there is no daily limit.
 * How long a run lasts is not a setting: the robot works that out itself from volatility.
 */
export type BotMode = "SCALPER" | "BASKET" | "ASIAN";
/** The Asian range breakout: the rule decides entry, stop, target and exit; the owner only sets the lot. */
export type RuleConfig = { lots: number };
/** The basket tool: open `count` trades at once, close them all together at a total profit or a total loss. */
export type BasketConfig = { lots: number; count: number; profit: number; loss: number };
/**
 * The entry filter every tool must pass before the robot opens a trade. Each number set to 0 switches
 * that check off; `on: false` switches the whole filter off. The robot reports which check blocked it.
 */
export type GateConfig = {
  on: boolean;
  trend: boolean; // H1 and M15 EMA20/EMA50 must both point the entry's way
  sessionStartUb: number; // first Ulaanbaatar hour traded
  sessionEndUb: number; // first UB hour not traded (wraps past midnight); equal to the start = all day
  newsBeforeMin: number; // no new entry this long before a HIGH-impact release
  newsAfterMin: number; // …nor this long after it
  atrMin: number; // M15 ATR(14) in $ below which the market is too quiet
  atrMax: number; // …above which it is too wild
  maxSpreadPct: number; // the spread may be at most this % of the M15 ATR
  rsiMax: number; // no BUY with M15 RSI(14) above this, no SELL below 100 minus it
  maxExtAtr: number; // no entry when price is more than this many M15 ATRs past EMA20 in the entry's direction
  maxTradesDay: number; // entries a day (a basket counts once); the day starts 08:00 UB
  minAgree: number; // how many of the site's methods must read the entry's side (0 = not checked)
  dailyLossPct: number; // % of the day's starting balance: the robot closes its trades and stops entering
};
export const DEFAULT_GATE: GateConfig = {
  on: true, trend: true, sessionStartUb: 15, sessionEndUb: 1, newsBeforeMin: 30, newsAfterMin: 60,
  atrMin: 1.5, atrMax: 25, maxSpreadPct: 10, rsiMax: 70, maxExtAtr: 2, maxTradesDay: 6, dailyLossPct: 3, minAgree: 8,
};

export type LiveConfig = {
  mode: BotMode; // which tool Start runs
  basket: BasketConfig;
  rule: RuleConfig;
  gate: GateConfig;
  lots: number;
  maxPositions: number; // how many positions the bot may hold at once
  slAtr: number; // stop distance in ATR(14, M1)
  tpAtr: number; // target distance in ATR(14, M1)
  profitTarget: number | null; // stop the run after this profit, USD
  maxLoss: number | null; // stop the run after this loss, USD
  allowReal: boolean; // trade on a real account as well as demo
};

export const DEFAULT_BASKET: BasketConfig = { lots: 0.01, count: 5, profit: 5, loss: 10 };
export const DEFAULT_LIVE_CONFIG: LiveConfig = { mode: "SCALPER", basket: DEFAULT_BASKET, rule: { lots: 0.01 }, gate: DEFAULT_GATE, lots: 0.01, maxPositions: 3, slAtr: 1.5, tpAtr: 2, profitTarget: null, maxLoss: null, allowReal: false };

const blank = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);
const positive = (msg: string) => z.coerce.number({ message: msg }).finite().positive(msg);
const optionalPositive = (msg: string) => z.preprocess(blank, positive(msg).nullable());
/** A broker will not take an unlimited number of orders in one burst. */
export const MAX_BASKET_COUNT = 100;
const allowReal = z.preprocess((v) => v === true || v === "on" || v === "1" || v === "true", z.boolean());
const configSchema = (t: T) => z.object({
  lots: positive(t("Лот 0-ээс их тоо байх ёстой", "Lots must be a number above 0")),
  maxPositions: z.coerce.number().int(t("Арилжааны тоо бүхэл тоо байх ёстой", "Number of trades must be a whole number")).min(1, t("Дор хаяж 1 арилжаа", "At least 1 trade")).max(200, t("Ихдээ 200 арилжаа", "At most 200 trades")),
  slAtr: positive(t("Stop 0-ээс их байх ёстой", "Stop must be above 0")).max(50),
  tpAtr: positive(t("Target 0-ээс их байх ёстой", "Target must be above 0")).max(50),
  profitTarget: optionalPositive(t("Ашгийн зорилт 0-ээс их байх ёстой", "Profit target must be above 0")),
  maxLoss: optionalPositive(t("Алдагдлын хязгаар 0-ээс их байх ёстой", "Loss limit must be above 0")),
  allowReal,
});

const basketSchema = (t: T) => z.object({
  bLots: positive(t("Лот 0-ээс их тоо байх ёстой", "Lots must be a number above 0")),
  bCount: z.coerce.number().int(t("Арилжааны тоо бүхэл тоо байх ёстой", "Number of trades must be a whole number")).min(1, t("Дор хаяж 1 арилжаа", "At least 1 trade")).max(MAX_BASKET_COUNT, t(`Ихдээ ${MAX_BASKET_COUNT} арилжаа`, `At most ${MAX_BASKET_COUNT} trades`)),
  bProfit: z.preprocess(blank, positive(t("Хаах ашгийн дүн ($) 0-ээс их байх ёстой", "The closing profit ($) must be above 0")).nullable()).refine((v) => v !== null, t("Хаах ашгийн дүнг ($) оруулна уу", "Enter the closing profit ($)")),
  bLoss: z.preprocess(blank, positive(t("Хаах алдагдлын дүн ($) 0-ээс их байх ёстой", "The closing loss ($) must be above 0")).nullable()).refine((v) => v !== null, t("Хаах алдагдлын дүнг ($) оруулна уу", "Enter the closing loss ($)")),
  allowReal,
});

const ruleSchema = (t: T) => z.object({ rLots: positive(t("Лот 0-ээс их тоо байх ёстой", "Lots must be a number above 0")), allowReal });

/** Each tool has its own form; saving one keeps the other's settings from `current`. */
export function parseConfig(input: unknown, current: LiveConfig = DEFAULT_LIVE_CONFIG, t: T = mnT): { config?: LiveConfig; error?: string } {
  const asked = (input as { mode?: unknown } | null)?.mode;
  const mode: BotMode = asked === "BASKET" || asked === "ASIAN" ? asked : "SCALPER";
  if (mode === "ASIAN") {
    const r = ruleSchema(t).safeParse(input);
    if (!r.success) return { error: r.error.issues[0].message };
    return { config: { ...current, mode, allowReal: r.data.allowReal, rule: { lots: r.data.rLots } } };
  }
  if (mode === "BASKET") {
    const r = basketSchema(t).safeParse(input);
    if (!r.success) return { error: r.error.issues[0].message };
    const { bLots, bCount, bProfit, bLoss, allowReal } = r.data;
    return { config: { ...current, mode, allowReal, basket: { lots: bLots, count: bCount, profit: bProfit!, loss: bLoss! } } };
  }
  const r = configSchema(t).safeParse(input);
  return r.success ? { config: { ...r.data, mode, basket: current.basket, rule: current.rule, gate: current.gate } } : { error: r.error.issues[0].message };
}

const zeroIfBlank = (v: unknown) => (v === "" || v === undefined || v === null ? 0 : v);
const hour = (msg: string) => z.coerce.number({ message: msg }).int(msg).min(0, msg).max(23, msg);
const within = (lo: number, hi: number, msg: string) => z.preprocess(zeroIfBlank, z.coerce.number({ message: msg }).finite(msg).min(lo, msg).max(hi, msg));
const wholeWithin = (lo: number, hi: number, msg: string) => z.preprocess(zeroIfBlank, z.coerce.number({ message: msg }).int(msg).min(lo, msg).max(hi, msg));
const gateSchema = (t: T) => z.object({
  gOn: allowReal, // a checkbox
  gTrend: allowReal,
  gStart: hour(t("Эхлэх цаг 0–23 байна", "The start hour must be 0–23")),
  gEnd: hour(t("Дуусах цаг 0–23 байна", "The end hour must be 0–23")),
  gNewsBefore: wholeWithin(0, 240, t("Мэдээний өмнөх хугацаа 0–240 бүхэл минут", "Minutes before news must be a whole number, 0–240")),
  gNewsAfter: wholeWithin(0, 240, t("Мэдээний дараах хугацаа 0–240 бүхэл минут", "Minutes after news must be a whole number, 0–240")),
  gAtrMin: within(0, 100, t("ATR-ийн доод хязгаар $0–100", "The lowest ATR must be $0–100")),
  gAtrMax: within(0, 200, t("ATR-ийн дээд хязгаар $0–200", "The highest ATR must be $0–200")),
  gSpreadPct: within(0, 100, t("Spread-ийн хязгаар ATR-ийн 0–100%", "The spread cap must be 0–100% of ATR")),
  gRsiMax: within(0, 95, t("RSI-ийн хязгаар 0 (үгүй) эсвэл 55–95", "The RSI cap must be 0 (off) or 55–95")).refine((v) => v === 0 || v >= 55, t("RSI-ийн хязгаар 0 (үгүй) эсвэл 55–95", "The RSI cap must be 0 (off) or 55–95")),
  gExtAtr: within(0, 20, t("EMA20-оос холдох хязгаар 0–20 ATR", "The stretch cap must be 0–20 ATR")),
  gMaxTrades: wholeWithin(0, 100, t("Өдрийн орох тоо 0–100 бүхэл тоо", "Entries a day must be a whole number, 0–100")),
  gAgree: wholeWithin(0, 16, t("Санал нийлэх аргын тоо 0 (шалгахгүй) – 16", "Methods that must agree: 0 (off) to 16")).optional(),
  gDailyLoss: within(0, 50, t("Өдрийн алдагдлын хязгаар балансын 0–50%", "The daily loss stop must be 0–50% of balance")),
}).refine((g) => !(g.gAtrMin > 0 && g.gAtrMax > 0 && g.gAtrMin >= g.gAtrMax), { message: t("ATR-ийн доод хязгаар дээд хязгаараасаа бага байх ёстой", "The lowest ATR must be below the highest") });

/** The entry filter has its own form; saving it keeps every tool's settings. */
export function parseGate(input: unknown, current: LiveConfig = DEFAULT_LIVE_CONFIG, t: T = mnT): { config?: LiveConfig; error?: string } {
  const r = gateSchema(t).safeParse(input);
  if (!r.success) return { error: r.error.issues[0].message };
  const g = r.data;
  return { config: { ...current, gate: {
    on: g.gOn, trend: g.gTrend, sessionStartUb: g.gStart, sessionEndUb: g.gEnd, newsBeforeMin: g.gNewsBefore, newsAfterMin: g.gNewsAfter,
    atrMin: g.gAtrMin, atrMax: g.gAtrMax, maxSpreadPct: g.gSpreadPct, rsiMax: g.gRsiMax, maxExtAtr: g.gExtAtr, maxTradesDay: g.gMaxTrades, dailyLossPct: g.gDailyLoss, minAgree: g.gAgree ?? current.gate?.minAgree ?? DEFAULT_GATE.minAgree,
  } } };
}

/** How far ahead the robot is told about releases. It syncs every second or two, so a day and a half is plenty. */
export const BLACKOUT_HORIZON_MS = 36 * 3600e3;
const MAX_BLACKOUTS = 24;

/**
 * The no-entry windows around HIGH-impact releases as "from-to;from-to" in UTC unix seconds, which the
 * robot reads with plain string splitting. Overlapping windows are merged; ones already over are dropped.
 */
export function blackoutWindows(releases: Date[], beforeMin: number, afterMin: number, now: Date, horizonMs = BLACKOUT_HORIZON_MS): string {
  if (beforeMin <= 0 && afterMin <= 0) return "";
  const nowS = Math.floor(now.getTime() / 1000);
  const end = nowS + Math.floor(horizonMs / 1000);
  const spans = releases
    .map((d) => Math.floor(d.getTime() / 1000))
    .filter((s) => Number.isFinite(s))
    .map((s): [number, number] => [s - beforeMin * 60, s + afterMin * 60])
    .filter(([a, b]) => b >= nowS && a <= end)
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged.slice(0, MAX_BLACKOUTS).map(([a, b]) => `${a}-${b}`).join(";");
}

export type AccountMode = "DEMO" | "REAL" | "CONTEST";
export type LiveState = { state: "RUNNING" | "STOPPED"; runId: string | null; closeAll: boolean; config: LiveConfig };
/** Flat on purpose: the terminal reads it with simple key lookups. 0 means "no limit". */
export type Command = {
  state: "RUNNING" | "STOPPED"; runId: string; closeAll: boolean; reason: string; mode: BotMode;
  lang: Locale; // the language the robot shows its chart text in (robot v2.40 and newer)
  lots: number; maxPositions: number; slAtr: number; tpAtr: number; profitTarget: number; maxLoss: number;
  // The entry filter (robot v2.80 and newer); 0 = that check is off.
  gateOn: boolean; gTrend: boolean; gSessionStart: number; gSessionEnd: number; gAtrMin: number; gAtrMax: number;
  gSpreadPct: number; gRsiMax: number; gExtAtr: number; gMaxTrades: number; gDailyLossPct: number;
  blackouts: string; // see blackoutWindows
  // The site's many-method reading (robot v2.90 and newer): the entry's side needs cMin methods; 0 = not checked.
  cMin: number; cBuy: number; cSell: number; cTotal: number;
};

/** The first robot file that knows each tool. Older files would run it as the scalper. */
export const BASKET_ROBOT_VERSION = 2;
export const ASIAN_ROBOT_VERSION = 3;
/**
 * Robot v2.80 (protocol 6) is the first with the entry filter and the order-handling fixes. An older
 * file would trade without the filter the owner set here, so no tool runs on it.
 */
export const GATE_ROBOT_VERSION = 7;
/** Robot v2.90 (protocol 7) is the first that waits for the site's many-method reading. */
export const CONSENSUS_ROBOT_VERSION = 7;
/** What the methods read right now, as counts. */
export type ConsensusCounts = { buy: number; sell: number; total: number };
export const minRobotVersion = (mode: BotMode) => Math.max(GATE_ROBOT_VERSION, mode === "ASIAN" ? ASIAN_ROBOT_VERSION : mode === "BASKET" ? BASKET_ROBOT_VERSION : 1);

/** The filter as flat fields. With the filter off, every check goes out switched off as well. */
function gateFields(g: GateConfig, blackouts: string, consensus: ConsensusCounts | null) {
  const on = g.on;
  const cMin = on ? (g.minAgree ?? 0) : 0;
  return {
    gateOn: on, gTrend: on && g.trend, gSessionStart: g.sessionStartUb, gSessionEnd: on ? g.sessionEndUb : g.sessionStartUb,
    gAtrMin: on ? g.atrMin : 0, gAtrMax: on ? g.atrMax : 0, gSpreadPct: on ? g.maxSpreadPct : 0, gRsiMax: on ? g.rsiMax : 0,
    gExtAtr: on ? g.maxExtAtr : 0, gMaxTrades: on ? g.maxTradesDay : 0, gDailyLossPct: on ? g.dailyLossPct : 0,
    blackouts: on ? blackouts : "",
    // With no reading to send, the counts go out as zero and the robot waits rather than guesses.
    cMin, cBuy: consensus?.buy ?? 0, cSell: consensus?.sell ?? 0, cTotal: consensus?.total ?? 0,
  };
}

export function commandFor(s: LiveState, account: { mode: AccountMode }, robotVersion?: number, lang: Locale = "mn", blackouts = "", consensus: ConsensusCounts | null = null): Command {
  const c = s.config;
  const basket = c.mode === "BASKET";
  const gate = gateFields({ ...DEFAULT_GATE, ...c.gate }, blackouts, consensus);
  const tool = c.mode === "ASIAN"
    ? { runId: s.runId ?? "", lang, mode: c.mode, lots: c.rule.lots, maxPositions: 1, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: 0, maxLoss: 0 }
    : basket
    ? { runId: s.runId ?? "", lang, mode: c.mode, lots: c.basket.lots, maxPositions: c.basket.count, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: c.basket.profit, maxLoss: c.basket.loss }
    : { runId: s.runId ?? "", lang, mode: c.mode, lots: c.lots, maxPositions: c.maxPositions, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: c.profitTarget ?? 0, maxLoss: c.maxLoss ?? 0 };
  const base = { ...tool, ...gate };
  if (s.state !== "RUNNING") return { ...base, state: "STOPPED", closeAll: s.closeAll, reason: "" };
  if (account.mode === "REAL" && !c.allowReal) return { ...base, state: "STOPPED", closeAll: false, reason: "REAL_NOT_ALLOWED" };
  if ((robotVersion ?? 1) < minRobotVersion(c.mode)) return { ...base, state: "STOPPED", closeAll: false, reason: "OLD_ROBOT" };
  // An older file would ignore the reading and trade without it.
  if (gate.cMin > 0 && (robotVersion ?? 1) < CONSENSUS_ROBOT_VERSION) return { ...base, state: "STOPPED", closeAll: false, reason: "OLD_ROBOT" };
  return { ...base, state: "RUNNING", closeAll: false, reason: "" };
}

export const newToken = () => randomBytes(24).toString("hex");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

const side = z.enum(["BUY", "SELL"]);
const num = z.number().finite();
export const reportSchema = z.object({
  account: z.object({ login: z.string().min(1).max(40), server: z.string().max(80).optional(), mode: z.enum(["DEMO", "REAL", "CONTEST"]), balance: num, equity: num, currency: z.string().max(10).optional() }),
  symbol: z.string().max(40),
  bid: num,
  ask: num,
  signal: z.enum(["BUY", "SELL", "NONE"]),
  reason: z.string().transform((s) => s.slice(0, 300)), // cut, not refused: a long reason must not cut the robot off
  runPnl: num,
  positions: z.array(z.object({ ticket: z.string().max(40), side, lots: num, openPrice: num, sl: num, tp: num, profit: num })).max(300),
  deals: z.array(z.object({ ticket: z.string().max(40), side, lots: num, openPrice: num, closePrice: num, profit: num, closeTime: z.coerce.date() })).max(200),
  finished: z.string().max(40),
  plannedSeconds: num.optional(), // the run length the robot worked out; 0 until its first trade
  elapsedSeconds: num.optional(),
  version: num.optional(), // the robot file's version; absent from files older than the basket tool
  // The entry filter's verdict (robot v2.80 and newer): the check that blocks an entry now, "" = none.
  gateOn: z.boolean().optional(),
  block: z.string().max(20).optional(),
  blockDetail: z.string().transform((s) => s.slice(0, 120)).optional(),
  tradesToday: num.optional(),
  dayPnl: num.optional(),
  dailyLossHit: z.boolean().optional(),
});
export type Report = z.infer<typeof reportSchema>;
