import { createHash, randomBytes } from "node:crypto";
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
export type LiveConfig = {
  mode: BotMode; // which tool Start runs
  basket: BasketConfig;
  rule: RuleConfig;
  lots: number;
  maxPositions: number; // how many positions the bot may hold at once
  slAtr: number; // stop distance in ATR(14, M1)
  tpAtr: number; // target distance in ATR(14, M1)
  profitTarget: number | null; // stop the run after this profit, USD
  maxLoss: number | null; // stop the run after this loss, USD
  allowReal: boolean; // trade on a real account as well as demo
};

export const DEFAULT_BASKET: BasketConfig = { lots: 0.01, count: 5, profit: 5, loss: 10 };
export const DEFAULT_LIVE_CONFIG: LiveConfig = { mode: "SCALPER", basket: DEFAULT_BASKET, rule: { lots: 0.01 }, lots: 0.01, maxPositions: 3, slAtr: 1.5, tpAtr: 2, profitTarget: null, maxLoss: null, allowReal: false };

const blank = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);
const positive = (msg: string) => z.coerce.number({ message: msg }).finite().positive(msg);
const optionalPositive = (msg: string) => z.preprocess(blank, positive(msg).nullable());
/** A broker will not take an unlimited number of orders in one burst. */
export const MAX_BASKET_COUNT = 100;
const configSchema = z.object({
  lots: positive("Лот 0-ээс их тоо байх ёстой"),
  maxPositions: z.coerce.number().int("Арилжааны тоо бүхэл тоо байх ёстой").min(1, "Дор хаяж 1 арилжаа").max(200, "Ихдээ 200 арилжаа"),
  slAtr: positive("Stop 0-ээс их байх ёстой").max(50),
  tpAtr: positive("Target 0-ээс их байх ёстой").max(50),
  profitTarget: optionalPositive("Ашгийн зорилт 0-ээс их байх ёстой"),
  maxLoss: optionalPositive("Алдагдлын хязгаар 0-ээс их байх ёстой"),
  allowReal: z.preprocess((v) => v === true || v === "on" || v === "1" || v === "true", z.boolean()),
});

const basketSchema = z.object({
  bLots: positive("Лот 0-ээс их тоо байх ёстой"),
  bCount: z.coerce.number().int("Арилжааны тоо бүхэл тоо байх ёстой").min(1, "Дор хаяж 1 арилжаа").max(MAX_BASKET_COUNT, `Ихдээ ${MAX_BASKET_COUNT} арилжаа`),
  bProfit: z.preprocess(blank, positive("Хаах ашгийн дүн ($) 0-ээс их байх ёстой").nullable()).refine((v) => v !== null, "Хаах ашгийн дүнг ($) оруулна уу"),
  bLoss: z.preprocess(blank, positive("Хаах алдагдлын дүн ($) 0-ээс их байх ёстой").nullable()).refine((v) => v !== null, "Хаах алдагдлын дүнг ($) оруулна уу"),
  allowReal: configSchema.shape.allowReal,
});

const ruleSchema = z.object({ rLots: positive("Лот 0-ээс их тоо байх ёстой"), allowReal: configSchema.shape.allowReal });

/** Each tool has its own form; saving one keeps the other's settings from `current`. */
export function parseConfig(input: unknown, current: LiveConfig = DEFAULT_LIVE_CONFIG): { config?: LiveConfig; error?: string } {
  const asked = (input as { mode?: unknown } | null)?.mode;
  const mode: BotMode = asked === "BASKET" || asked === "ASIAN" ? asked : "SCALPER";
  if (mode === "ASIAN") {
    const r = ruleSchema.safeParse(input);
    if (!r.success) return { error: r.error.issues[0].message };
    return { config: { ...current, mode, allowReal: r.data.allowReal, rule: { lots: r.data.rLots } } };
  }
  if (mode === "BASKET") {
    const r = basketSchema.safeParse(input);
    if (!r.success) return { error: r.error.issues[0].message };
    const { bLots, bCount, bProfit, bLoss, allowReal } = r.data;
    return { config: { ...current, mode, allowReal, basket: { lots: bLots, count: bCount, profit: bProfit!, loss: bLoss! } } };
  }
  const r = configSchema.safeParse(input);
  return r.success ? { config: { ...r.data, mode, basket: current.basket, rule: current.rule } } : { error: r.error.issues[0].message };
}

export type AccountMode = "DEMO" | "REAL" | "CONTEST";
export type LiveState = { state: "RUNNING" | "STOPPED"; runId: string | null; closeAll: boolean; config: LiveConfig };
/** Flat on purpose: the terminal reads it with simple key lookups. 0 means "no limit". */
export type Command = {
  state: "RUNNING" | "STOPPED"; runId: string; closeAll: boolean; reason: string; mode: BotMode;
  lots: number; maxPositions: number; slAtr: number; tpAtr: number; profitTarget: number; maxLoss: number;
};

/** The first robot file that knows each tool. Older files would run it as the scalper. */
export const BASKET_ROBOT_VERSION = 2;
export const ASIAN_ROBOT_VERSION = 3;
export const minRobotVersion = (mode: BotMode) => (mode === "ASIAN" ? ASIAN_ROBOT_VERSION : mode === "BASKET" ? BASKET_ROBOT_VERSION : 1);

export function commandFor(s: LiveState, account: { mode: AccountMode }, robotVersion?: number): Command {
  const c = s.config;
  const basket = c.mode === "BASKET";
  const base = c.mode === "ASIAN"
    ? { runId: s.runId ?? "", mode: c.mode, lots: c.rule.lots, maxPositions: 1, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: 0, maxLoss: 0 }
    : basket
    ? { runId: s.runId ?? "", mode: c.mode, lots: c.basket.lots, maxPositions: c.basket.count, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: c.basket.profit, maxLoss: c.basket.loss }
    : { runId: s.runId ?? "", mode: c.mode, lots: c.lots, maxPositions: c.maxPositions, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: c.profitTarget ?? 0, maxLoss: c.maxLoss ?? 0 };
  if (s.state !== "RUNNING") return { ...base, state: "STOPPED", closeAll: s.closeAll, reason: "" };
  if (account.mode === "REAL" && !c.allowReal) return { ...base, state: "STOPPED", closeAll: false, reason: "REAL_NOT_ALLOWED" };
  if ((robotVersion ?? 1) < minRobotVersion(c.mode)) return { ...base, state: "STOPPED", closeAll: false, reason: "OLD_ROBOT" };
  return { ...base, state: "RUNNING", closeAll: false, reason: "" };
}

export const newToken = () => randomBytes(24).toString("hex");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

const side = z.enum(["BUY", "SELL"]);
const num = z.number().finite();
export const reportSchema = z.object({
  account: z.object({ login: z.string().max(40), mode: z.enum(["DEMO", "REAL", "CONTEST"]), balance: num, equity: num, currency: z.string().max(10).optional() }),
  symbol: z.string().max(40),
  bid: num,
  ask: num,
  signal: z.enum(["BUY", "SELL", "NONE"]),
  reason: z.string().max(300),
  runPnl: num,
  positions: z.array(z.object({ ticket: z.string().max(40), side, lots: num, openPrice: num, sl: num, tp: num, profit: num })).max(300),
  deals: z.array(z.object({ ticket: z.string().max(40), side, lots: num, openPrice: num, closePrice: num, profit: num, closeTime: z.coerce.date() })).max(200),
  finished: z.string().max(40),
  plannedSeconds: num.optional(), // the run length the robot worked out; 0 until its first trade
  elapsedSeconds: num.optional(),
  version: num.optional(), // the robot file's version; absent from files older than the basket tool
});
export type Report = z.infer<typeof reportSchema>;
