import { sql, type SQL } from "drizzle-orm";
import { vi } from "vitest";
import { db } from "@/lib/db";
import { briefDue, briefKey, briefText, prevCloseOf, sendMorningBrief, setupOutlook, type BriefSetup, type BriefState } from "@/lib/brief";
import { rangeSetup } from "@/lib/setup/setups";
import { SESSION_RULES } from "@/lib/setup/sessionRules";
import { findUserById } from "@/lib/users";
import { handleUpdate, telegramTiming } from "@/lib/telegram";
import { viewer, MN_VIEWER } from "@/lib/viewer";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

const EN = viewer({ locale: "en", timeZone: "Asia/Ulaanbaatar" });
const MONDAY = new Date(Date.UTC(2026, 10, 30, 0, 1)); // 08:01 Ulaanbaatar
const forming = (id: BriefSetup["id"], name: string, dailyOk: boolean, agree: boolean): BriefSetup => ({
  id, name, status: "FORMING", side: null, headline: "range forming",
  checks: [{ label: "range complete", ok: false }, { label: dailyOk ? "Өдрийн trend: дээш" : "Өдрийн trend: тодорхойгүй", ok: dailyOk }, { label: agree ? "4 цагийн trend: дээш · өдрийнхтэй нэг чиглэлд" : "4 цагийн trend: доош · өдрийнх дээш тул зөрж байна", ok: agree }],
});
const state = (o: Partial<BriefState> = {}): BriefState => ({
  now: MONDAY, price: 4012.5, prevClose: 4000, trend: { daily: 72, h4: 40 },
  setups: [forming("asian-breakout", "Азийн хүрээний breakout", true, true), forming("ny-open-breakout", "Нью-Йоркийн нээлтийн breakout", true, true), forming("ny-late-breakout", "Нью-Йоркийн хоёр дахь цагийн breakout", true, true)],
  events: [{ time: new Date(Date.UTC(2026, 10, 30, 13, 30)), title: "NFP", type: "OTHER" }],
  ...o,
});

test("the brief: price and change, both trends in words, each setup's window and outlook, today's news, the signal line", () => {
  const text = briefText(state());
  for (const part of [
    "Өглөөний тойм", "Даваа 2026-11-30",
    "<b>4012.50</b>", "+12.50 · +0.31%",
    "Өдрийн trend: <b>дээш · хүчтэй</b> (+72)", "4 цагийн trend: <b>дээш · дунд</b> (+40)",
    "Хүрээ 08:00–15:00, орох 20:00 хүртэл (УБ)", // the Asian rule in Ulaanbaatar time
    "Хүрээ 20:30–21:30, орох 02:00 хүртэл (УБ)",
    "✅ Өнөөдөр боломжтой: зөвхөн BUY",
    "🔴 21:30 · NFP", "breakout-ыг алгасна",
    "Дохио гармагц шууд илгээнэ",
    "/brief off",
  ]) expect(text).toContain(part);
  expect(text).not.toContain("undefined");
});

test("why a setup cannot trade: the trends disagree, the daily trend is too weak for New York, a trade already open", () => {
  const weak = { daily: 28, h4: -50 };
  const asian = setupOutlook(forming("asian-breakout", "A", true, false), weak, MN_VIEWER);
  expect(asian).toMatch(/^⏸ Одоогоор орохгүй: 4 цагийн trend: доош · өдрийнх дээш тул зөрж байна/);
  expect(setupOutlook(forming("ny-open-breakout", "N", true, true), weak, MN_VIEWER)).toBe("⛔ Өнөөдөр орохгүй: өдрийн trend-ийн хүч 28 &lt; 35");
  expect(setupOutlook(forming("asian-breakout", "A", false, false), { daily: null, h4: null }, MN_VIEWER)).toContain("⛔ Өнөөдөр орохгүй: Өдрийн trend: тодорхойгүй");
  expect(setupOutlook({ ...forming("ny-late-breakout", "L", true, true), status: "ACTIVE", side: "SELL", headline: "SELL: хүрээнээс доош гарлаа" }, weak, MN_VIEWER)).toBe("🟢 SELL: хүрээнээс доош гарлаа · арилжаа нээлттэй");
  expect(setupOutlook(forming("asian-breakout", "A", true, true), { daily: -50, h4: -40 }, EN)).toContain("SELL only");
  // the text is a weak-trend day: no New York trade, strength words for both
  const text = briefText(state({ trend: weak, events: [] }), EN);
  for (const part of ["Morning brief", "Daily trend: <b>up · weak</b> (+28)", "4-hour trend: <b>down · moderate</b> (−50)", "No trade today: daily trend strength 28 &lt; 35", "No important releases today.", "Signals are sent the moment they fire."]) expect(text).toContain(part);
});

test("the outlook reads the live reading's own checks (rangeSetup before the range closes)", () => {
  const bars = Array.from({ length: 8 }, (_, i) => ({ time: new Date(Date.UTC(2026, 10, 27, 22) + i * 9e5), open: 4000, high: 4002, low: 3998, close: 4000 }));
  const rule = SESSION_RULES[0];
  const agree = rangeSetup(rule, bars, { daily: 70, h4: 50, atrD: 30 }, [], MONDAY);
  expect(agree.status).toBe("FORMING");
  expect(setupOutlook({ ...agree, id: rule.id, name: "A" }, { daily: 70, h4: 50 }, MN_VIEWER)).toContain("зөвхөн BUY");
  const split = rangeSetup(rule, bars, { daily: 70, h4: -50, atrD: 30 }, [], MONDAY);
  expect(setupOutlook({ ...split, id: rule.id, name: "A" }, { daily: 70, h4: -50 }, MN_VIEWER)).toContain("зөрж байна");
});

test("the previous close is the last bar before today 00:00 UTC, Friday's on a Monday", () => {
  const bar = (iso: string, close: number) => ({ time: new Date(iso), close });
  const bars = [bar("2026-11-27T20:45:00Z", 4001), bar("2026-11-29T23:00:00Z", 4005), bar("2026-11-29T23:45:00Z", 4006), bar("2026-11-30T00:00:00Z", 4010)];
  expect(prevCloseOf(bars, MONDAY)).toBe(4001);
  expect(prevCloseOf([bar("2026-12-01T23:45:00Z", 4020), bar("2026-12-02T00:00:00Z", 4021)], new Date("2026-12-02T00:05:00Z"))).toBe(4020);
});

describe("sending", () => {
  let sent: { chat: string; html: string }[];
  const send = async (chat: string, html: string) => { sent.push({ chat, html }); return true; };
  const load = async () => state();
  const realSleep = telegramTiming.sleep;
  beforeEach(async () => {
    await resetDb();
    await db.execute(sql`TRUNCATE app_state`);
    sent = [];
    telegramTiming.sleep = async () => undefined;
  });
  afterEach(() => { telegramTiming.sleep = realSleep; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  const member = async (email: string, chat: string, extra?: SQL) => {
    const u = await makeUser(email);
    await db.execute(sql`UPDATE users SET access_until = '2099-01-01', telegram_chat_id = ${chat} WHERE id = ${u.id}`);
    if (extra) await db.execute(sql`UPDATE users SET ${extra} WHERE id = ${u.id}`);
    return u;
  };

  test("only on weekdays from 08:00 Ulaanbaatar, and only once a day however often it runs", async () => {
    await member("a@x.mn", "111");
    expect(briefDue(new Date(Date.UTC(2026, 10, 28, 0, 5)))).toBe(false); // Saturday
    expect(briefDue(new Date(Date.UTC(2026, 10, 29, 0, 5)))).toBe(false); // Sunday
    expect(briefDue(new Date(Date.UTC(2026, 10, 30, 4)))).toBe(false); // too late to be a morning brief
    expect(await sendMorningBrief(new Date(Date.UTC(2026, 10, 29, 0, 5)), { send, load })).toBe(0);
    expect(await sendMorningBrief(MONDAY, { send, load })).toBe(1);
    expect(await sendMorningBrief(new Date(MONDAY.getTime() + 15 * 6e4), { send, load })).toBe(0); // the next run, or a restart
    expect(sent).toHaveLength(1);
    expect(sent[0].chat).toBe("111");
    expect(sent[0].html).toContain("Өглөөний тойм");
    const [row] = (await db.execute(sql`SELECT key FROM app_state WHERE key = ${briefKey(MONDAY)}`)).rows;
    expect(row).toBeTruthy();
    expect(await sendMorningBrief(new Date(Date.UTC(2026, 11, 1, 0, 1)), { send, load })).toBe(1); // Tuesday
  });

  test("only members with a plan and a linked chat who have not opted out or paused signals", async () => {
    await member("a@x.mn", "111");
    await member("off@x.mn", "222", sql`brief_off = true`);
    await member("paused@x.mn", "333", sql`signals_paused = true`);
    await member("expired@x.mn", "444", sql`access_until = '2020-01-01'`);
    await makeUser("nochat@x.mn");
    const en = await member("en@x.mn", "555", sql`locale = 'en'`);
    expect(await sendMorningBrief(MONDAY, { send, load })).toBe(2);
    expect(sent.map((s) => s.chat).sort()).toEqual(["111", "555"]);
    expect(sent.find((s) => s.chat === "555")!.html).toContain("Morning brief");
    expect(en.id).toBeTruthy();
  });

  test("/brief off and /brief on from Telegram", async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test");
    vi.stubGlobal("fetch", async (_url: string | URL, init?: RequestInit) => { calls.push(JSON.parse(String(init?.body ?? "{}"))); return new Response(JSON.stringify({ ok: true, result: {} })); });
    const u = await member("a@x.mn", "777");
    const msg = (text: string) => ({ message: { chat: { id: 777, type: "private" }, text } });
    await handleUpdate(msg("/brief off"), MONDAY);
    expect((await findUserById(u.id))!.briefOff).toBe(true);
    expect(String(calls.at(-1)?.text)).toContain("/brief on");
    expect(await sendMorningBrief(MONDAY, { send, load })).toBe(0);
    await handleUpdate(msg("/brief on"), MONDAY);
    expect((await findUserById(u.id))!.briefOff).toBe(false);
    expect(String(calls.at(-1)?.text)).toContain("08:00");
    await handleUpdate(msg("/brief"), MONDAY); // today's brief on demand, from the stored (here empty) prices
    expect(String(calls.at(-1)?.text)).toContain("Өглөөний тойм");
    expect(String(calls.at(-1)?.text)).toContain("Дохио гармагц шууд илгээнэ");
    await handleUpdate(msg("/help"), MONDAY);
    expect(String(calls.at(-1)?.text)).toContain("/brief");
  });
});
