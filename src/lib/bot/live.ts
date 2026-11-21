import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/** What the owner sets on the web. Lot size is theirs to choose; there is no daily limit. */
export type LiveConfig = {
  lots: number;
  maxPositions: number; // how many positions the bot may hold at once
  slAtr: number; // stop distance in ATR(14, M1)
  tpAtr: number; // target distance in ATR(14, M1)
  profitTarget: number | null; // stop the run after this profit, USD
  maxLoss: number | null; // stop the run after this loss, USD
  maxSeconds: number | null; // stop the run after this long
  allowReal: boolean; // trade on a real account as well as demo
};

export const DEFAULT_LIVE_CONFIG: LiveConfig = { lots: 0.01, maxPositions: 3, slAtr: 1.5, tpAtr: 2, profitTarget: null, maxLoss: null, maxSeconds: null, allowReal: false };

const blank = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);
const positive = (msg: string) => z.coerce.number({ message: msg }).finite().positive(msg);
const optionalPositive = (msg: string) => z.preprocess(blank, positive(msg).nullable());
const configSchema = z.object({
  lots: positive("Лот 0-ээс их тоо байх ёстой"),
  maxPositions: z.coerce.number().int("Арилжааны тоо бүхэл тоо байх ёстой").min(1, "Дор хаяж 1 арилжаа").max(200, "Ихдээ 200 арилжаа"),
  slAtr: positive("Stop 0-ээс их байх ёстой").max(50),
  tpAtr: positive("Target 0-ээс их байх ёстой").max(50),
  profitTarget: optionalPositive("Ашгийн зорилт 0-ээс их байх ёстой"),
  maxLoss: optionalPositive("Алдагдлын хязгаар 0-ээс их байх ёстой"),
  maxSeconds: z.preprocess(blank, z.coerce.number().int().min(1, "Хугацаа дор хаяж 1 секунд").max(86_400).nullable()),
  allowReal: z.preprocess((v) => v === true || v === "on" || v === "1" || v === "true", z.boolean()),
});

export function parseConfig(input: unknown): { config?: LiveConfig; error?: string } {
  const r = configSchema.safeParse(input);
  return r.success ? { config: r.data } : { error: r.error.issues[0].message };
}

export type AccountMode = "DEMO" | "REAL" | "CONTEST";
export type LiveState = { state: "RUNNING" | "STOPPED"; runId: string | null; closeAll: boolean; config: LiveConfig };
/** Flat on purpose: the terminal reads it with simple key lookups. 0 means "no limit". */
export type Command = {
  state: "RUNNING" | "STOPPED"; runId: string; closeAll: boolean; reason: string;
  lots: number; maxPositions: number; slAtr: number; tpAtr: number; profitTarget: number; maxLoss: number; maxSeconds: number;
};

export function commandFor(s: LiveState, account: { mode: AccountMode }): Command {
  const c = s.config;
  const base = { runId: s.runId ?? "", lots: c.lots, maxPositions: c.maxPositions, slAtr: c.slAtr, tpAtr: c.tpAtr, profitTarget: c.profitTarget ?? 0, maxLoss: c.maxLoss ?? 0, maxSeconds: c.maxSeconds ?? 0 };
  if (s.state !== "RUNNING") return { ...base, state: "STOPPED", closeAll: s.closeAll, reason: "" };
  if (account.mode === "REAL" && !c.allowReal) return { ...base, state: "STOPPED", closeAll: false, reason: "REAL_NOT_ALLOWED" };
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
});
export type Report = z.infer<typeof reportSchema>;
