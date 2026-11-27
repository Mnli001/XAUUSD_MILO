import { createHash, randomBytes } from "node:crypto";
import { mnT, type Locale, type T } from "../i18n";
import { z } from "zod";

/**
 * What the owner sets on the web. Lot size is theirs to choose; there is no daily limit.
 * How long a run lasts is not a setting: the robot works that out itself from volatility.
 */
export type BotMode = "SCALPER" | "BASKET" | "ASIAN" | "READING" | "DAY";
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
  /** How a trade is sized: fixed lots (the tool's own field), a dollar amount risked per trade, or a share of the balance. */
  riskMode: RiskMode;
  riskValue: number; // USD: dollars per trade; PCT: % of balance; unused for LOTS
  protect: boolean; // move the stop to entry at +1R and trail from +1.5R (Scalper trades)
  siteStops: boolean; // stop and target from the site's reading (1-hour ATR) instead of the 1-minute ATR
  dayLean: number; // day trader: how many more methods must read its side than the other
  minAgree: number; // how many of the site's methods must read the entry's side (0 = not checked)
  dailyLossPct: number; // % of the day's starting balance: the robot closes its trades and stops entering
};
export type RiskMode = "LOTS" | "USD" | "PCT";
export const RISK_MODES: RiskMode[] = ["LOTS", "USD", "PCT"];
export const DEFAULT_GATE: GateConfig = {
  on: true, trend: true, sessionStartUb: 15, sessionEndUb: 1, newsBeforeMin: 30, newsAfterMin: 60,
  atrMin: 1.5, atrMax: 25, maxSpreadPct: 10, rsiMax: 70, maxExtAtr: 2, maxTradesDay: 6, dailyLossPct: 3, minAgree: 8, riskMode: "LOTS", riskValue: 0, siteStops: false, protect: false, dayLean: 2,
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
/**
 * A new bot runs the site's Setup signals (ASIAN) and sizes each trade at 1% of the balance. The entry filter's own
 * defaults stay in DEFAULT_GATE: the Setup signals send it switched off (see gateFields), the older tools still read it.
 */
export const DEFAULT_RISK_PCT = 1;
export const DEFAULT_LIVE_CONFIG: LiveConfig = { mode: "ASIAN", basket: DEFAULT_BASKET, rule: { lots: 0.01 }, gate: { ...DEFAULT_GATE, riskMode: "PCT", riskValue: DEFAULT_RISK_PCT }, lots: 0.01, maxPositions: 3, slAtr: 1.5, tpAtr: 2, profitTarget: null, maxLoss: null, allowReal: false };

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
  const mode: BotMode = asked === "BASKET" || asked === "ASIAN" || asked === "READING" || asked === "DAY" ? asked : "SCALPER";
  if (mode === "ASIAN" || mode === "READING" || mode === "DAY") {
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

/** The Bot page's one settings form: how big each Setup-signal trade is, and whether a real account may trade. */
export const SIMPLE_RISK_PCT = { min: 0.1, max: 5 } as const;
export const SIMPLE_MAX_LOTS = 100;
const simpleSchema = (t: T) => z.discriminatedUnion("sizing", [
  z.object({
    sizing: z.literal("PCT"),
    pct: z.preprocess(blank, z.coerce.number({ message: t("Эрсдэлийн хувийг оруулна уу", "Enter the risk percent") }).finite()
      .min(SIMPLE_RISK_PCT.min, t(`Эрсдэл балансын ${SIMPLE_RISK_PCT.min}–${SIMPLE_RISK_PCT.max}% байна`, `Risk must be ${SIMPLE_RISK_PCT.min}–${SIMPLE_RISK_PCT.max}% of balance`))
      .max(SIMPLE_RISK_PCT.max, t(`Эрсдэл балансын ${SIMPLE_RISK_PCT.min}–${SIMPLE_RISK_PCT.max}% байна`, `Risk must be ${SIMPLE_RISK_PCT.min}–${SIMPLE_RISK_PCT.max}% of balance`))),
    allowReal,
  }),
  z.object({
    sizing: z.literal("LOTS"),
    lots: z.preprocess(blank, z.coerce.number({ message: t("Лотын хэмжээг оруулна уу", "Enter the lot size") }).finite()
      .min(0.01, t(`Лот 0.01–${SIMPLE_MAX_LOTS} байна`, `Lots must be 0.01–${SIMPLE_MAX_LOTS}`))
      .max(SIMPLE_MAX_LOTS, t(`Лот 0.01–${SIMPLE_MAX_LOTS} байна`, `Lots must be 0.01–${SIMPLE_MAX_LOTS}`))),
    allowReal,
  }),
], { error: () => t("Эрсдэлийн төрлөө сонгоно уу", "Choose how to size a trade") });

/**
 * The simple settings: always the Setup signals (ASIAN), sized by % of balance or by a fixed lot. Every other
 * setting (the older tools' fields, the filter's checks) is kept as it was, so an older robot keeps working.
 */
export function parseSimple(input: unknown, current: LiveConfig = DEFAULT_LIVE_CONFIG, t: T = mnT): { config?: LiveConfig; error?: string } {
  const r = simpleSchema(t).safeParse(input);
  if (!r.success) return { error: r.error.issues[0].message };
  const gate = { ...DEFAULT_GATE, ...current.gate };
  if (r.data.sizing === "PCT") return { config: { ...current, mode: "ASIAN", allowReal: r.data.allowReal, gate: { ...gate, riskMode: "PCT", riskValue: r.data.pct } } };
  return { config: { ...current, mode: "ASIAN", allowReal: r.data.allowReal, rule: { ...current.rule, lots: r.data.lots }, gate: { ...gate, riskMode: "LOTS", riskValue: 0 } } };
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
  gAgree: wholeWithin(0, 14, t("Санал нийлэх аргын тоо 0 (шалгахгүй) – 14", "Methods that must agree: 0 (off) to 14")).optional(),
  gDayLean: wholeWithin(0, 10, t("Day trader-ийн зөрүү 0–10 бүхэл тоо", "The day trader's margin must be a whole number, 0–10")).optional(),
  gRiskMode: z.enum(["LOTS", "USD", "PCT"]).optional(),
  gRiskVal: within(0, 100000, t("Эрсдэлийн дүн 0-ээс их тоо байна", "The risk amount must be a number above 0")).optional(),
  gSiteStops: allowReal.optional(),
  gProtect: allowReal.optional(),
  gDailyLoss: within(0, 50, t("Өдрийн алдагдлын хязгаар балансын 0–50%", "The daily loss stop must be 0–50% of balance")),
}).refine((g) => !(g.gRiskMode === "USD" && !((g.gRiskVal ?? 0) > 0)), { message: t("Арилжаа бүрт эрсдэлд оруулах $ дүнг оруулна уу", "Enter the dollars to risk per trade") })
  .refine((g) => !(g.gRiskMode === "PCT" && !((g.gRiskVal ?? 0) > 0 && (g.gRiskVal ?? 0) <= 50)), { message: t("Эрсдэл балансын 0–50% байна", "Risk must be 0–50% of balance") })
  .refine((g) => !(g.gAtrMin > 0 && g.gAtrMax > 0 && g.gAtrMin >= g.gAtrMax), { message: t("ATR-ийн доод хязгаар дээд хязгаараасаа бага байх ёстой", "The lowest ATR must be below the highest") });

/** The entry filter has its own form; saving it keeps every tool's settings. */
export function parseGate(input: unknown, current: LiveConfig = DEFAULT_LIVE_CONFIG, t: T = mnT): { config?: LiveConfig; error?: string } {
  const r = gateSchema(t).safeParse(input);
  if (!r.success) return { error: r.error.issues[0].message };
  const g = r.data;
  return { config: { ...current, gate: {
    on: g.gOn, trend: g.gTrend, sessionStartUb: g.gStart, sessionEndUb: g.gEnd, newsBeforeMin: g.gNewsBefore, newsAfterMin: g.gNewsAfter,
    atrMin: g.gAtrMin, atrMax: g.gAtrMax, maxSpreadPct: g.gSpreadPct, rsiMax: g.gRsiMax, maxExtAtr: g.gExtAtr, maxTradesDay: g.gMaxTrades, dailyLossPct: g.gDailyLoss, minAgree: g.gAgree ?? current.gate?.minAgree ?? DEFAULT_GATE.minAgree,
    riskMode: g.gRiskMode ?? current.gate?.riskMode ?? "LOTS", riskValue: g.gRiskMode && g.gRiskMode !== "LOTS" ? (g.gRiskVal ?? 0) : g.gRiskMode ? 0 : (current.gate?.riskValue ?? 0),
    siteStops: g.gRiskMode !== undefined ? (g.gSiteStops ?? false) : (current.gate?.siteStops ?? false),
    protect: g.gRiskMode !== undefined ? (g.gProtect ?? false) : (current.gate?.protect ?? false),
    dayLean: g.gDayLean ?? current.gate?.dayLean ?? DEFAULT_GATE.dayLean,
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

/** The robot's chart text is written in Mongolian and English only; every other reader gets English there. */
export type RobotLang = "mn" | "en";
export const robotLang = (locale: Locale): RobotLang => (locale === "mn" ? "mn" : "en");

export type AccountMode = "DEMO" | "REAL" | "CONTEST";
export type LiveState = { state: "RUNNING" | "STOPPED"; runId: string | null; closeAll: boolean; config: LiveConfig };
/** Flat on purpose: the terminal reads it with simple key lookups. 0 means "no limit". */
export type Command = {
  state: "RUNNING" | "STOPPED"; runId: string; closeAll: boolean; reason: string; mode: BotMode;
  lang: RobotLang; // the language the robot shows its chart text in (robot v2.40 and newer)
  lots: number; maxPositions: number; slAtr: number; tpAtr: number; profitTarget: number; maxLoss: number;
  // The entry filter (robot v2.80 and newer); 0 = that check is off.
  gateOn: boolean; gTrend: boolean; gSessionStart: number; gSessionEnd: number; gAtrMin: number; gAtrMax: number;
  gSpreadPct: number; gRsiMax: number; gExtAtr: number; gMaxTrades: number; gDailyLossPct: number;
  blackouts: string; // see blackoutWindows
  // The site's many-method reading (robot v2.90 and newer): the entry's side needs cMin methods; 0 = not checked.
  cMin: number; cBuy: number; cSell: number; cTotal: number;
  // Sizing and stops (robot v3.00 and newer). rMode 0 lots, 1 dollars per trade, 2 % of balance. sMode 1: stop = sStop × sAtr, target = stop × sRR.
  rMode: number; rVal: number; sMode: number; sAtr: number; sStop: number; sRR: number;
  protect: boolean; // robot v3.10 and newer
  // The day trader's or Asian tool's order (robot v3.40 / v3.50 and newer): dId 0 means "nothing now". dRisk is the stop distance in dollars.
  dId: number; dDir: number; dRisk: number; dRR: number; dAge: number;
  dExit: number; // the order's own time exit, UTC unix seconds (robot v3.60+); 0 = the robot's default
  /**
   * Every live session order (robot v3.70+, Asian tool only), "id,dir,entry,sl,tp,ageSec,exitAt" joined by ";".
   * id is unique per rule (see AsianOrder in lib/setup/build); entry, sl and tp are absolute prices. The first order
   * is also sent as dId…dExit (dId = its bar's close, as before) for older robots, which take one order at a time.
   */
  orders: string;
  oMaxAge: number; // seconds an order stays valid after its bar closed (ENTRY_FRESH_MS)
  oSlipR: number; // no entry once price has run this share of the risk past the entry toward the target
};

/** The first robot file that knows each tool. Older files would run it as the scalper. */
export const BASKET_ROBOT_VERSION = 2;
/** 12: the Asian tool takes the site's breakout instead of its own EMA trend. 13: any session's setup, with its own time exit (dExit). */
export const ASIAN_ROBOT_VERSION = 13;
/**
 * Robot v2.80 (protocol 6) is the first with the entry filter and the order-handling fixes. An older
 * file would trade without the filter the owner set here, so no tool runs on it.
 */
export const GATE_ROBOT_VERSION = 9;
/** Robot v2.90 (protocol 7) is the first that waits for the site's many-method reading. */
export const CONSENSUS_ROBOT_VERSION = 7;
/** What the methods read right now, as counts. */
export type ConsensusCounts = { buy: number; sell: number; total: number; atrH1?: number };
/** The site plan's stop and reward, as the robot receives them (the same numbers the reasoning panel shows). */
export const SITE_STOP_ATR = 1.5;
export const SITE_RR = 2;
/** Robot v3.30 (protocol 10) is the first that can trade the reading itself. */
export const READING_ROBOT_VERSION = 10;
/** Robot v3.40 (protocol 11) is the first with the day trader. */
export const DAY_ROBOT_VERSION = 11;
export type DayOrderFields = { id: number; dir: number; risk: number; rr: number; ageSec: number; exitAt?: number };
/** A session setup's order with its own prices (lib/setup/build AsianOrder). */
export type SessionOrderFields = DayOrderFields & { legacyId: number; entry: number; sl: number; tp: number; size?: number };
/** The robot file the site serves (mt5/XauBot.mq5): its version number and the label people see. */
export const ROBOT_FILE_VERSION = 15;
export const ROBOT_FILE_LABEL = "3.80";
/** Order freshness and price-run limits, the same ones Telegram uses (see ENTRY_FRESH_MS in lib/setup/build). */
export const ORDER_MAX_AGE_SEC = 30 * 60;
export const ORDER_SLIP_R = 0.3;
/** The reading tool waits for this many methods when the owner set none: the level the research held up at. */
export const READING_MIN_AGREE = 9;
export const minRobotVersion = (mode: BotMode) => Math.max(GATE_ROBOT_VERSION, mode === "DAY" ? DAY_ROBOT_VERSION : mode === "READING" ? READING_ROBOT_VERSION : mode === "ASIAN" ? ASIAN_ROBOT_VERSION : mode === "BASKET" ? BASKET_ROBOT_VERSION : 1);

/** The order list as the robot reads it: plain numbers, no nesting (the robot parses JSON by key lookups). */
export const ordersField = (orders: SessionOrderFields[]): string =>
  orders.map((o) => [o.id, o.dir, o.entry, o.sl, o.tp, Math.round(o.ageSec), o.exitAt ?? 0, o.size ?? 1].join(",")).join(";"); // 8th: size factor (robot v3.80+; older ones read 7)

/**
 * The filter as flat fields. With the filter off, every check goes out switched off as well. The session tool
 * (ASIAN) trades exactly the site's rules: none of the filter's checks apply (they were never part of the replayed
 * rule), only the sizing (rMode/rVal) is kept; the robot's own open-position cap still holds.
 */
function gateFields(g: GateConfig, blackouts: string, consensus: ConsensusCounts | null, reading = false, sessionRules = false) {
  if (sessionRules) g = { ...g, on: false, protect: false, siteStops: false };
  const on = g.on;
  // The reading tool always needs a threshold and the site's stop distance, whatever the filter says.
  const cMin = reading ? ((g.minAgree ?? 0) > 0 ? g.minAgree : READING_MIN_AGREE) : on ? (g.minAgree ?? 0) : 0;
  const siteStops = reading || g.siteStops;
  return {
    gateOn: on, gTrend: on && g.trend, gSessionStart: g.sessionStartUb, gSessionEnd: on ? g.sessionEndUb : g.sessionStartUb,
    gAtrMin: on ? g.atrMin : 0, gAtrMax: on ? g.atrMax : 0, gSpreadPct: on ? g.maxSpreadPct : 0, gRsiMax: on ? g.rsiMax : 0,
    gExtAtr: on ? g.maxExtAtr : 0, gMaxTrades: on ? g.maxTradesDay : 0, gDailyLossPct: on ? g.dailyLossPct : 0,
    blackouts: on ? blackouts : "",
    // With no reading to send, the counts go out as zero and the robot waits rather than guesses.
    cMin, cBuy: consensus?.buy ?? 0, cSell: consensus?.sell ?? 0, cTotal: consensus?.total ?? 0,
    rMode: RISK_MODES.indexOf(g.riskMode ?? "LOTS"), rVal: g.riskMode && g.riskMode !== "LOTS" ? g.riskValue : 0,
    // With site stops on and no reading, sAtr goes out as 0 and the robot waits.
    sMode: siteStops ? 1 : 0, sAtr: siteStops && Number.isFinite(consensus?.atrH1) ? Math.round((consensus!.atrH1 as number) * 100) / 100 : 0, sStop: SITE_STOP_ATR, sRR: SITE_RR,
    protect: !!g.protect,
  };
}

export function commandFor(s: LiveState, account: { mode: AccountMode }, robotVersion?: number, lang: RobotLang = "mn", blackouts = "", consensus: ConsensusCounts | null = null, day: DayOrderFields | null = null, sessionOrders: SessionOrderFields[] = []): Command {
  const c = s.config;
  const basket = c.mode === "BASKET";
  const gate = gateFields({ ...DEFAULT_GATE, ...c.gate }, blackouts, consensus, c.mode === "READING", c.mode === "ASIAN");
  // The Asian tool: the newest order doubles as the single order older robots read (dId = its bar's close, as before).
  if (c.mode === "ASIAN" && sessionOrders.length && !day) { const f = sessionOrders[0]; day = { ...f, id: f.legacyId }; }
  const tool = c.mode === "ASIAN" || c.mode === "READING" || c.mode === "DAY"
    ? { runId: s.runId ?? "", lang, mode: c.mode, lots: c.rule.lots, maxPositions: 1, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: 0, maxLoss: 0 }
    : basket
    ? { runId: s.runId ?? "", lang, mode: c.mode, lots: c.basket.lots, maxPositions: c.basket.count, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: c.basket.profit, maxLoss: c.basket.loss }
    : { runId: s.runId ?? "", lang, mode: c.mode, lots: c.lots, maxPositions: c.maxPositions, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: c.profitTarget ?? 0, maxLoss: c.maxLoss ?? 0 };
  const order = (c.mode === "DAY" || c.mode === "ASIAN") && day ? { dId: day.id, dDir: day.dir, dRisk: day.risk, dRR: day.rr, dAge: day.ageSec, dExit: day.exitAt ?? 0 } : { dId: 0, dDir: 0, dRisk: 0, dRR: 2, dAge: 0, dExit: 0 };
  const orders = { orders: c.mode === "ASIAN" ? ordersField(sessionOrders) : "", oMaxAge: ORDER_MAX_AGE_SEC, oSlipR: ORDER_SLIP_R };
  const base = { ...tool, ...gate, ...order, ...orders };
  if (s.state !== "RUNNING") return { ...base, state: "STOPPED", closeAll: s.closeAll, reason: "" };
  if (account.mode === "REAL" && !c.allowReal) return { ...base, state: "STOPPED", closeAll: false, reason: "REAL_NOT_ALLOWED" };
  if ((robotVersion ?? 1) < minRobotVersion(c.mode)) return { ...base, state: "STOPPED", closeAll: false, reason: "OLD_ROBOT" };
  // An older file would ignore the reading and trade without it.
  if (gate.cMin > 0 && (robotVersion ?? 1) < CONSENSUS_ROBOT_VERSION) return { ...base, state: "STOPPED", closeAll: false, reason: "OLD_ROBOT" };
  return { ...base, state: "RUNNING", closeAll: false, reason: "" };
}

export const newToken = () => randomBytes(24).toString("hex");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** A robot writes at most a few hundred characters of reason; anything far longer is not a robot's report. */
export const MAX_REASON_CHARS = 4000;
/** A full report (300 positions, 200 deals) is well under this; a larger body is refused before it is parsed. */
export const MAX_REPORT_CHARS = 256_000;
const side = z.enum(["BUY", "SELL"]);
const num = z.number().finite();
export const reportSchema = z.object({
  account: z.object({ login: z.string().min(1).max(40), server: z.string().max(80).optional(), mode: z.enum(["DEMO", "REAL", "CONTEST"]), balance: num, equity: num, currency: z.string().max(10).optional() }),
  symbol: z.string().max(40),
  bid: num,
  ask: num,
  signal: z.enum(["BUY", "SELL", "NONE"]),
  reason: z.string().max(MAX_REASON_CHARS).transform((s) => s.slice(0, 300)), // cut, not refused: a long reason must not cut the robot off (only an absurd one is refused)
  runPnl: num,
  positions: z.array(z.object({ ticket: z.string().max(40), side, lots: num, openPrice: num, sl: num, tp: num, profit: num })).max(300),
  deals: z.array(z.object({ ticket: z.string().max(40), side, lots: num, openPrice: num, closePrice: num, profit: num, closeTime: z.coerce.date(), position: z.string().max(40).optional() })).max(200),
  finished: z.string().max(40),
  plannedSeconds: num.optional(), // the run length the robot worked out; 0 until its first trade
  elapsedSeconds: num.optional(),
  version: num.optional(), // the robot file's version; absent from files older than the basket tool
  // The entry filter's verdict (robot v2.80 and newer): the check that blocks an entry now, "" = none.
  gateOn: z.boolean().optional(),
  block: z.string().max(20).optional(),
  blockDetail: z.string().max(MAX_REASON_CHARS).transform((s) => s.slice(0, 120)).optional(),
  tradesToday: num.optional(),
  dayPnl: num.optional(),
  dailyLossHit: z.boolean().optional(),
});
export type Report = z.infer<typeof reportSchema>;

/**
 * Ready-made filter settings for people who do not want to tune fourteen fields. Each keeps the
 * trading hours and volatility limits and changes how picky and how large the robot is.
 */
export type PresetId = "CAREFUL" | "BALANCED" | "ACTIVE";
export const PRESETS: Record<PresetId, Partial<GateConfig>> = {
  // The agreement levels are the ones the candle research held up at (8–10); 11 and above was too rare to judge.
  CAREFUL: { on: true, trend: true, minAgree: 10, maxTradesDay: 3, dailyLossPct: 2, rsiMax: 68, riskMode: "PCT", riskValue: 1, siteStops: true, protect: true },
  BALANCED: { on: true, trend: true, minAgree: 9, maxTradesDay: 5, dailyLossPct: 3, rsiMax: 70, riskMode: "PCT", riskValue: 2, siteStops: true, protect: true },
  ACTIVE: { on: true, trend: true, minAgree: 8, maxTradesDay: 8, dailyLossPct: 5, rsiMax: 75, riskMode: "PCT", riskValue: 3, siteStops: false, protect: true },
};
export const isPreset = (v: unknown): v is PresetId => v === "CAREFUL" || v === "BALANCED" || v === "ACTIVE";
export const applyPreset = (current: LiveConfig, id: PresetId): LiveConfig => ({ ...current, gate: { ...DEFAULT_GATE, ...current.gate, ...PRESETS[id] } });

/**
 * A reply that tells the robot to stop and carries nothing else: no order, no reading, no news windows. Sent to a
 * robot whose owner has no access or whose account cannot be served; built before any signal work is done.
 */
export function stoppedCommand(reason: string, lang: RobotLang = "mn"): Command {
  return {
    state: "STOPPED", runId: "", closeAll: false, reason, mode: "SCALPER", lang,
    lots: 0, maxPositions: 1, slAtr: 0, tpAtr: 0, profitTarget: 0, maxLoss: 0,
    gateOn: false, gTrend: false, gSessionStart: 0, gSessionEnd: 0, gAtrMin: 0, gAtrMax: 0, gSpreadPct: 0, gRsiMax: 0, gExtAtr: 0, gMaxTrades: 0, gDailyLossPct: 0,
    blackouts: "", cMin: 0, cBuy: 0, cSell: 0, cTotal: 0, rMode: 0, rVal: 0, sMode: 0, sAtr: 0, sStop: SITE_STOP_ATR, sRR: SITE_RR, protect: false,
    dId: 0, dDir: 0, dRisk: 0, dRR: 2, dAge: 0, dExit: 0, orders: "", oMaxAge: ORDER_MAX_AGE_SEC, oSlipR: ORDER_SLIP_R,
  };
}
