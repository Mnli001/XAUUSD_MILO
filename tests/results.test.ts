import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { emitResults, resultText } from "@/lib/signals";
import { telegramTiming } from "@/lib/telegram";
import { tradeChartSvg } from "@/lib/tradeChart";
import type { Candle } from "@/lib/analysis/indicators";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

const M15 = 15 * 6e4;
const start = Date.UTC(2026, 10, 24, 0, 0);
/** One UTC day of bars held at 4006 (±2), some overridden. */
const day = (over: Record<number, Partial<Candle>> = {}): Candle[] =>
  Array.from({ length: 96 }, (_, i) => ({ time: new Date(start + i * M15), open: 4006, high: 4008, low: 4004, close: 4006, ...over[i] }));
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 24, h, m));

let sent: { chat: string; png: boolean; caption: string }[];
const send = async (chat: string, png: Buffer | null, caption: string) => { sent.push({ chat, png: !!png, caption }); return true; };
const realSleep = telegramTiming.sleep;
afterEach(() => { telegramTiming.sleep = realSleep; });
beforeEach(async () => {
  telegramTiming.sleep = async () => {};
  await resetDb();
  await db.execute(sql`TRUNCATE signals`);
  sent = [];
  const u = await makeUser("a@x.mn");
  await db.execute(sql`UPDATE users SET access_until = '2027-01-01', telegram_chat_id = '111' WHERE id = ${u.id}`);
});
const addSignal = (createdAt: Date) => db.insert(schema.signals).values({ key: `asian-breakout:${createdAt.toISOString()}`, setupId: "asian-breakout", name: "Азийн хүрээний breakout", side: "BUY", entry: 4006, stop: 4000, target: 4024, createdAt });

test("a signal that hit its target is announced once, with a picture and its result", async () => {
  await addSignal(at(8, 30));
  const bars = day({ 40: { high: 4025, low: 4010 } });
  expect(await emitResults(at(11), { send, bars })).toBe(1);
  expect(sent).toHaveLength(1);
  expect(sent[0].png).toBe(true);
  for (const part of ["TP хүрлээ", "BUY XAUUSD", "+3.00R", "+$18.00", "4006.00", "4024.00"]) expect(sent[0].caption).toContain(part);
  expect(await emitResults(at(11, 5), { send, bars })).toBe(0); // never twice
  expect(sent).toHaveLength(1);
});
test("a stop is announced as a loss; a trade still open waits", async () => {
  await addSignal(at(8, 30));
  expect(await emitResults(at(9), { send, bars: day() })).toBe(0); // open
  expect(await emitResults(at(11), { send, bars: day({ 40: { low: 3999 } }) })).toBe(1);
  expect(sent[0].caption).toContain("SL хүрлээ");
  expect(sent[0].caption).toContain("−$6.00");
});
test("when Telegram fails for everyone the result is tried again", async () => {
  await addSignal(at(8, 30));
  const bars = day({ 40: { high: 4025, low: 4010 } });
  expect(await emitResults(at(11), { send: async () => { throw new Error("down"); }, bars })).toBe(0);
  expect(await emitResults(at(11, 5), { send, bars })).toBe(1);
});
test("the text names the outcome in English too, and the picture shows entry, stop and target", () => {
  const caption = resultText({ side: "SELL", name: "Asian range breakout", entry: 4006, stop: 4012, target: 3988 }, { kind: "TIME", r: 0.4, at: at(20) }, undefined, null);
  expect(caption).toContain("Цагаар хаагдлаа");
  const svg = tradeChartSvg({ bars: day(), side: "BUY", entry: 4006, stop: 4000, target: 4024, openedAt: at(8, 30), exit: { at: at(10, 15), price: 4024, kind: "WIN" }, title: "TP", subtitle: "x", badge: { text: "+3.00R", kind: "WIN" }, clock: (d) => d.toISOString().slice(11, 16) });
  for (const part of ["4006.00", "4000.00", "4024.00", "+3.00R", "<circle"]) expect(svg).toContain(part);
});
