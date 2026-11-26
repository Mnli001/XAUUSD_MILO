import type { Candle } from "../analysis/indicators";
import { type BotParams, type Side, DEFAULT_PARAMS, inNewsWindow } from "../bot/strategy";
import { MN_VIEWER, type Viewer } from "../viewer";
import { type SessionRule, hourUtc, ruleExitAt, ruleOf } from "./sessionRules";

/**
 * A setup is a rule read against the market as it stands now: is it forming, worth watching,
 * live, or off — and where the entry, stop and target sit. The rules are the same ones the
 * backtests replay (lib/bot/ideas.ts), so the history shown beside a setup is that rule's own.
 */
export type SetupStatus = "FORMING" | "WATCH" | "ACTIVE" | "OFF";
export type SetupHistory = { n: number; winPct: number | null; avgR: number | null; profitFactor: number | null };
export type SetupNow = {
  status: SetupStatus;
  side: Side | null;
  headline: string; // what is happening, in one line
  detail: string; // what would have to happen next, or why it is off
  entry: number | null;
  stop: number | null;
  target: number | null;
  band: { high: number; low: number } | null; // a price zone worth drawing (the Asian range)
  checks: { label: string; ok: boolean }[];
  at?: Date; // when the 15-minute bar that made it active closed (kept after the trade ends)
  stale?: boolean; // the price feed has stopped; nothing here is current
  trends?: { daily: Side | null; h4: Side | null }; // the trends as they stand now (set when they keep the rule out)
  window?: { rangeFrom: number; rangeTo: number; entryTo: number; exitAt: Date }; // the rule's hours (UTC) and this day's time exit
  result?: number; // a trade that already ended today: its result in R (+2 target, −1 stop, or the time exit)
};

const M15 = 15 * 6e4;
const PARAMS: BotParams = DEFAULT_PARAMS;
const px = (v: number) => v.toFixed(2);
const off = (headline: string, detail: string, extra: Partial<SetupNow> = {}): SetupNow =>
  ({ status: "OFF", side: null, headline, detail, entry: null, stop: null, target: null, band: null, checks: [], ...extra });
const marketClosed = (now: Date) => { const d = now.getUTCDay(); return d === 6 || d === 0; };

export const ASIAN_RR = 3;
/** No closed 15-minute bar for this long on a trading day means the feed has stopped (the daily break is one hour). */
export const STALE_FEED_MS = 90 * 6e4;

type Score = number | null;
/** A trend score: one value for every bar, or a series aligned with the 15-minute bars (each bar read with the score it had). */
export type AsianScores = { daily: Score | Score[]; h4: Score | Score[]; atrD: Score | Score[] };
const scoreAt = (x: Score | Score[], i: number): Score => (Array.isArray(x) ? (x[i] ?? null) : x);

/** The Asian rule, for callers that only know that one. */
export const asianSetup = (m15: Candle[], scores: AsianScores, news: Date[], now: Date, v: Viewer = MN_VIEWER, day?: string): SetupNow =>
  rangeSetup(ruleOf("asian-breakout")!, m15, scores, news, now, v, day);

/**
 * A session-range breakout (lib/setup/sessionRules.ts) read now, exactly as the replay judges it: the opening
 * range, the first close outside it before the rule's entry hour in the direction the daily and 4-hour trends
 * had at that close (outside news windows), a minimum range against the daily ATR, stop at the middle, target
 * rr times the stop, flat at the rule's time exit. `day` reads an earlier day's range (a trade held overnight).
 */
export function rangeSetup(rule: SessionRule, m15: Candle[], scores: AsianScores, news: Date[], now: Date, v: Viewer = MN_VIEWER, day?: string): SetupNow {
  const { t, ub, zone } = v;
  const at = (h: number) => ub(utcToUb(h)); // a UTC hour of the rule on the viewer's clock
  const rangeName = rule.id === "asian-breakout" ? t("Азийн хүрээ", "Asian range") : t("Нээлтийн хүрээ", "Opening range");
  if (marketClosed(now)) return off(t("Зах хаалттай", "Market closed"), t(`Алтны зах даваа гарагийн өглөө нээгдэнэ. ${rangeName} тэр өдөр ${at(rule.rangeFrom)}–${at(rule.rangeTo)} (${zone}) цагт бүрдэнэ.`, `The gold market reopens after the weekend. The ${rangeName.toLowerCase()} then forms between ${at(rule.rangeFrom)} and ${at(rule.rangeTo)} (${zone}).`));
  // Prices that stopped arriving are not a quiet market: say so, instead of reading old bars as today's.
  const newest = m15.at(-1);
  const lag = newest ? now.getTime() - (newest.time.getTime() + M15) : Infinity;
  if (lag > STALE_FEED_MS && !(now.getUTCDay() === 1 && now.getUTCHours() < 1)) {
    const since = newest ? `${v.dateTime(new Date(newest.time.getTime() + M15))} (${zone})` : t("хэзээ ч", "never");
    return off(t("Үнийн дата хоцорч байна", "Price data is behind"), t(`Сүүлийн 15 минутын лаа ${since} хаагдсан. Шинэ үнэ ирэх хүртэл энэ setup-ыг уншихгүй.`, `The last 15-minute candle closed at ${since}. This setup is not read until fresh prices arrive.`), { stale: true });
  }
  const today = day ?? now.toISOString().slice(0, 10);
  const dayStart = Date.parse(`${today}T00:00:00Z`);
  const exitAt = ruleExitAt(rule, today);
  const hourOf = (b: Candle) => (b.time.getTime() - dayStart) / 36e5;
  const bars = m15.filter((b) => b.time.toISOString().slice(0, 10) === today && b.time.getTime() + M15 <= now.getTime());
  const range = bars.filter((b) => hourOf(b) >= rule.rangeFrom && hourOf(b) < rule.rangeTo);
  const band = range.length ? { high: Math.max(...range.map((b) => b.high)), low: Math.min(...range.map((b) => b.low)) } : null;
  const hour = (now.getTime() - dayStart) / 36e5; // hours since that day's 00:00 UTC
  const closeWord = rule.exit === "same20" || new Date(dayStart).getUTCDay() === 5 ? `${ub("04:00")} (${zone})` : t(`маргааш ${ub("15:00")} (${zone})`, `tomorrow ${ub("15:00")} (${zone})`);
  const sideOf = (x: Score): Side | null => (x === null || x === 0 ? null : x > 0 ? "BUY" : "SELL");
  const dirWord = (s: Side | null) => (s === null ? t("тодорхойгүй", "unclear") : s === "BUY" ? t("дээш", "up") : t("доош", "down"));
  // The trends as they stood at bar i: the 4-hour score moves during the day, so a breakout is judged by the one it had.
  const reading = (i: number) => {
    const daily = sideOf(scoreAt(scores.daily, i)), h4 = sideOf(scoreAt(scores.h4, i));
    const trend: Side | null = daily !== null && daily === h4 ? daily : null;
    return { daily, h4, trend };
  };
  const checksAt = ({ daily, h4, trend }: ReturnType<typeof reading>) => [
    { label: t(`${rangeName} бүрдсэн (${at(rule.rangeTo)} ${zone})`, `${rangeName} complete (${at(rule.rangeTo)} ${zone})`), ok: hour >= rule.rangeTo && range.length >= rule.minBars },
    { label: t(`Өдрийн тренд: ${dirWord(daily)}`, `Daily trend: ${dirWord(daily)}`), ok: daily !== null },
    {
      label: daily === null || h4 === null
        ? t(`4 цагийн тренд: ${dirWord(h4)}`, `4-hour trend: ${dirWord(h4)}`)
        : trend !== null
          ? t(`4 цагийн тренд: ${dirWord(h4)} · өдрийнхтэй нэг чиглэлд`, `4-hour trend: ${dirWord(h4)} · agrees with the daily`)
          : t(`4 цагийн тренд: ${dirWord(h4)} · өдрийнх ${dirWord(daily)} тул зөрж байна`, `4-hour trend: ${dirWord(h4)} · the daily is ${dirWord(daily)}, so they disagree`),
      ok: trend !== null,
    },
  ];
  const latest = reading(m15.length - 1);
  const checks = checksAt(latest);
  const window = { rangeFrom: rule.rangeFrom, rangeTo: rule.rangeTo, entryTo: rule.entryTo, exitAt };
  const w = <T extends SetupNow>(x: T): T => ({ ...x, window });
  if (hour < rule.rangeTo) return w({ ...off(t(`${rangeName} бүрдэж байна`, `The ${rangeName.toLowerCase()} is forming`), t(`Хүрээ ${at(rule.rangeTo)} (${zone}) цагт хаагдана. Түүний дараа хүрээнээс гарсан эхний 15 минутын хаалтыг харна.`, `The range closes at ${at(rule.rangeTo)} (${zone}). After that, the first 15-minute close outside the range is what counts.`)), status: "FORMING", band, checks });
  if (!band || range.length < rule.minBars) return w(off(t("Хүрээний дата дутуу", "Range data is incomplete"), t("Хүрээний 15 минутын лаа хангалттай ирээгүй тул өнөөдөр энэ setup-ыг тооцохгүй.", "Not enough 15-minute candles arrived for the range, so this setup is not counted today."), { band, checks }));

  const mid = (band.high + band.low) / 2;
  const sideWordOf = (sd: Side) => (sd === "BUY" ? t("дээш", "above") : t("доош", "below"));
  const breakout = bars.find((b) => {
    const h = hourOf(b);
    if (h < rule.rangeTo || h >= rule.entryTo) return false;
    const tr = reading(m15.indexOf(b)).trend;
    return tr !== null && (tr === "BUY" ? b.close > band.high : b.close < band.low) && !inNewsWindow(new Date(b.time.getTime() + M15), news, PARAMS);
  });
  if (breakout) {
    const then = reading(m15.indexOf(breakout));
    const trend = then.trend!;
    const dir = trend === "BUY" ? 1 : -1;
    const sideWord = sideWordOf(trend);
    const done = [...checksAt(then), { label: t(`Хүрээнээс ${sideWord} хаагдсан (мэдээний цонхноос гадуур)`, `Closed ${sideWord} the range (outside a news window)`), ok: true }];
    // As the replay: the first breakout decides the day; one from a range too narrow for the day's usual move is passed.
    const atr = scoreAt(scores.atrD, m15.indexOf(breakout));
    const need = atr === null || !Number.isFinite(atr) ? Infinity : rule.minStopAtr * atr;
    if (!(Math.abs(breakout.close - mid) >= need)) {
      const narrow = { label: t(`Stop өдрийн ATR-ийн ${rule.minStopAtr}-аас их`, `Stop at least ${rule.minStopAtr} of the daily ATR`), ok: false };
      return w(off(t("Хүрээ хэт нарийн, өнөөдөр орохгүй", "Range too narrow, no trade today"), t(`Breakout гарсан ч stop ${px(Math.abs(breakout.close - mid))}$ нь өдрийн дундаж хэлбэлзлийн (ATR ${Number.isFinite(need) ? px(atr!) : "—"}$) хувьд хэт бага. Ийм нарийн хүрээний breakout түүхэнд ихэвчлэн хуурамч гарсан тул алгасна.`, `A breakout came, but its stop of $${px(Math.abs(breakout.close - mid))} is too small for the day's usual move (ATR $${Number.isFinite(need) ? px(atr!) : "—"}). Breakouts from ranges this narrow were mostly false in the past, so the day is passed.`), { band, checks: [...done, narrow] }));
    }
    const entry = breakout.close, dist = Math.abs(entry - mid), target = entry + dir * dist * rule.rr;
    const levels = { side: trend, band, entry, stop: mid, target, at: new Date(breakout.time.getTime() + M15) };
    // Walk the bars after the entry exactly as the replay does: a bar touching both counts as the stop.
    const after = m15.filter((b) => b.time.getTime() > breakout.time.getTime() && b.time.getTime() < exitAt.getTime() && b.time.getTime() + M15 <= now.getTime());
    const exit = after.find((b) => (dir > 0 ? b.low <= mid : b.high >= mid) || (dir > 0 ? b.high >= target : b.low <= target));
    if (exit) {
      const stopped = dir > 0 ? exit.low <= mid : exit.high >= mid;
      const when = `${v.time(new Date(exit.time.getTime() + M15))} (${zone})`;
      return w({ ...off(
        stopped ? t(`${trend} хаагдсан: stop-д хүрсэн (−1R)`, `${trend} closed: stop hit (−1R)`) : t(`${trend} хаагдсан: target-д хүрсэн (+${rule.rr}R)`, `${trend} closed: target hit (+${rule.rr}R)`),
        stopped
          ? t(`Арилжаа ${when} цагт stop ${px(mid)}-д хүрч хаагдсан. Шинээр орохгүй. Дараагийн хүрээг хүлээнэ.`, `The trade hit its stop at ${px(mid)} at ${when}. No new entry. Waiting for the next range.`)
          : t(`Арилжаа ${when} цагт target ${px(target)}-д хүрч хаагдсан. Шинээр орохгүй. Дараагийн хүрээг хүлээнэ.`, `The trade reached its target at ${px(target)} at ${when}. No new entry. Waiting for the next range.`),
        { checks: done }), ...levels, result: stopped ? -1 : rule.rr });
    }
    if (now.getTime() >= exitAt.getTime()) {
      const lastBar = after.at(-1) ?? breakout;
      const r = Math.round(((dir * (lastBar.close - entry)) / dist) * 100) / 100;
      return w({ ...off(t(`${trend} цагаар хаагдсан (${r >= 0 ? "+" : ""}${r.toFixed(2)}R)`, `${trend} closed on time (${r >= 0 ? "+" : ""}${r.toFixed(2)}R)`), t(`Stop, target аль нь ч хүрээгүй тул ${v.dateTime(exitAt).slice(5)} (${zone}) цагт ${px(lastBar.close)} үнээр хаагдсан.`, `Neither the stop nor the target was hit, so it was closed at ${px(lastBar.close)} at ${v.dateTime(exitAt).slice(5)} (${zone}).`), { checks: done }), ...levels, result: r });
    }
    return w({
      status: "ACTIVE", checks: done, ...levels,
      headline: t(`${trend}: хүрээнээс ${sideWord} гарлаа`, `${trend}: broke ${sideWord} the range`),
      detail: t(`15 минутын лаа ${px(entry)} дээр хүрээний гадна, трендийн чиглэлд хаагдсан. Stop нь хүрээний дунд, target нь stop-оос ${rule.rr} дахин хол. ${closeWord} хүртэл барина, хүрээгүй бол тэр үед хаана.`, `A 15-minute candle closed outside the range at ${px(entry)}, in the direction of the trend. The stop is the middle of the range and the target is ${rule.rr} times as far. It is held until ${closeWord} and closed then if neither is hit.`),
    });
  }
  if (hour >= rule.entryTo) return w(off(t("Өнөөдөр breakout гараагүй", "No breakout today"), t(`Орох цонх ${at(rule.entryTo)} (${zone}) цагт хаагдсан. Дараагийн хүрээг хүлээнэ.`, `The entry window closed at ${at(rule.entryTo)} (${zone}). Waiting for the next range.`), { band, checks }));
  const trend = latest.trend;
  if (!trend) return w({ ...off(latest.daily === null ? t("Өдрийн тренд тодорхойгүй", "Daily trend is unclear") : t("4 цагийн тренд өдрийнхтэй зөрж байна", "The 4-hour trend disagrees with the daily"), t("Энэ дүрэм өдөр, 4 цагийн тренд нэг чиглэлд байхад л тэр чиглэлд breakout авдаг. Хоёулаа таарах хүртэл орохгүй.", "This rule takes a breakout only when the daily and 4-hour trends point the same way, and only in that direction. Until they agree there is no entry."), { band, checks }), status: "WATCH", trends: { daily: latest.daily, h4: latest.h4 } }); // the window is still open: the 4-hour trend can turn
  const dir = trend === "BUY" ? 1 : -1;
  const sideWord = sideWordOf(trend);
  const level = trend === "BUY" ? band.high : band.low;
  const dist = Math.abs(level - mid);
  return w({
    status: "WATCH", side: trend, band, checks: [...checks, { label: t(`Хүрээнээс ${sideWord} хаагдсан (мэдээний цонхноос гадуур)`, `Closed ${sideWord} the range (outside a news window)`), ok: false }],
    headline: t(`${trend} боломж: ${px(level)}-аас ${sideWord} хаагдвал`, `${trend} possible: on a close ${sideWord} ${px(level)}`),
    detail: t(`15 минутын лаа ${px(level)}-аас ${sideWord} хаагдвал ${trend} орох scenario. Эсрэг тал руу гарсан хаалтыг авахгүй. Stop хүрээний дунд (${px(mid)}), target ойролцоогоор ${px(level + dir * dist * rule.rr)}. Бодит түвшин хаагдсан үнээс тооцогдоно. Цонх ${at(rule.entryTo)} (${zone}) хүртэл.`, `If a 15-minute candle closes ${sideWord} ${px(level)}, the scenario is a ${trend} entry. A close out the other side is not taken. Stop at the middle of the range (${px(mid)}), target near ${px(level + dir * dist * rule.rr)}. The real levels are worked out from the closing price. The window runs until ${at(rule.entryTo)} (${zone}).`),
    entry: level, stop: mid, target: level + dir * dist * rule.rr,
  });
}

/** A UTC hour of the day (12.5 = 12:30) as an Ulaanbaatar wall-clock time, for viewer.ub(). */
const utcToUb = (h: number) => hourUtc((h + 8) % 24);

export const MIN_HISTORY = 30;

/** How the rule did when replayed over stored history. No percentage from fewer than MIN_HISTORY trades. */
export function historyOf(trades: { r: number }[]): SetupHistory {
  const n = trades.length;
  if (n < MIN_HISTORY) return { n, winPct: null, avgR: null, profitFactor: null };
  let wins = 0, gain = 0, loss = 0;
  for (const { r } of trades) { if (r > 0) { wins++; gain += r; } else loss -= r; }
  return { n, winPct: Math.round((wins / n) * 1000) / 10, avgR: Math.round(((gain - loss) / n) * 1000) / 1000, profitFactor: loss > 0 ? gain / loss : null };
}
