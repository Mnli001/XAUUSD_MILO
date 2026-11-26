import type { Candle } from "../analysis/indicators";
import { type BotParams, type Side, DEFAULT_PARAMS, inNewsWindow } from "../bot/strategy";
import { MN_VIEWER, type Viewer } from "../viewer";
import { ASIAN_MIN_STOP_ATR } from "../bot/ideas";

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
  result?: number; // a trade that already ended today: its result in R (+2 target, −1 stop, or the time exit)
};

const M15 = 15 * 6e4;
const PARAMS: BotParams = DEFAULT_PARAMS;
const px = (v: number) => v.toFixed(2);
const off = (headline: string, detail: string, extra: Partial<SetupNow> = {}): SetupNow =>
  ({ status: "OFF", side: null, headline, detail, entry: null, stop: null, target: null, band: null, checks: [], ...extra });
const marketClosed = (now: Date) => { const d = now.getUTCDay(); return d === 6 || d === 0; };

export const ASIAN_RR = 3;
export const ASIAN_MIN_BARS = 20;
/** No closed 15-minute bar for this long on a trading day means the feed has stopped (the daily break is one hour). */
export const STALE_FEED_MS = 90 * 6e4;

/**
 * Asian range breakout with the trend. Range: 00:00–07:00 UTC (08:00–15:00 UB).
 * The daily and 4-hour trend scores must point the same way. From 07:00 to 16:00 UTC the first 15-minute
 * close outside the range, in that direction, is the entry; stop at the middle of the range,
 * target three times the stop, flat by 20:00 UTC.
 */
type Score = number | null;
/** A trend score: one value for every bar, or a series aligned with the 15-minute bars (each bar read with the score it had). */
export type AsianScores = { daily: Score | Score[]; h4: Score | Score[]; atrD: Score | Score[] };
const scoreAt = (x: Score | Score[], i: number): Score => (Array.isArray(x) ? (x[i] ?? null) : x);

export function asianSetup(m15: Candle[], scores: AsianScores, news: Date[], now: Date, v: Viewer = MN_VIEWER): SetupNow {
  const { t, ub, zone } = v;
  if (marketClosed(now)) return off(t("Зах хаалттай", "Market closed"), t(`Алтны зах даваа гарагийн өглөө нээгдэнэ. Азийн хүрээ тэр өдөр ${ub("08:00")}–${ub("15:00")} (${zone}) цагт бүрдэнэ.`, `The gold market reopens after the weekend. The Asian range then forms between ${ub("08:00")} and ${ub("15:00")} (${zone}).`));
  // Prices that stopped arriving are not a quiet market: say so, instead of reading old bars as today's.
  const newest = m15.at(-1);
  const lag = newest ? now.getTime() - (newest.time.getTime() + M15) : Infinity;
  if (lag > STALE_FEED_MS && !(now.getUTCDay() === 1 && now.getUTCHours() < 1)) {
    const since = newest ? `${v.dateTime(new Date(newest.time.getTime() + M15))} (${zone})` : t("хэзээ ч", "never");
    return off(t("Үнийн дата хоцорч байна", "Price data is behind"), t(`Сүүлийн 15 минутын лаа ${since} хаагдсан. Шинэ үнэ ирэх хүртэл энэ setup-ыг уншихгүй.`, `The last 15-minute candle closed at ${since}. This setup is not read until fresh prices arrive.`), { stale: true });
  }
  const today = now.toISOString().slice(0, 10);
  const bars = m15.filter((b) => b.time.toISOString().slice(0, 10) === today && b.time.getTime() + M15 <= now.getTime());
  const range = bars.filter((b) => b.time.getUTCHours() < 7);
  const band = range.length ? { high: Math.max(...range.map((b) => b.high)), low: Math.min(...range.map((b) => b.low)) } : null;
  const hour = now.getUTCHours();
  const sideOf = (x: Score): Side | null => (x === null || x === 0 ? null : x > 0 ? "BUY" : "SELL");
  const word = (s: Side | null) => (s === null ? "" : s === "BUY" ? t(" (дээш)", " (up)") : t(" (доош)", " (down)"));
  // The trends as they stood at bar i: the 4-hour score moves during the day, so a breakout is judged by the one it had.
  const reading = (i: number) => {
    const daily = sideOf(scoreAt(scores.daily, i)), h4 = sideOf(scoreAt(scores.h4, i));
    const trend: Side | null = daily !== null && daily === h4 ? daily : null;
    return { daily, h4, trend };
  };
  const checksAt = ({ daily, h4, trend }: ReturnType<typeof reading>) => [
    { label: t(`Азийн хүрээ бүрдсэн (${ub("15:00")} ${zone})`, `Asian range complete (${ub("15:00")} ${zone})`), ok: hour >= 7 && range.length >= ASIAN_MIN_BARS },
    { label: t(`Өдрийн тренд тодорхой${word(daily)}`, `Daily trend is clear${word(daily)}`), ok: daily !== null },
    { label: t(`4 цагийн тренд өдрийнхтэй нэг чиглэлд${word(h4)}`, `4-hour trend agrees with the daily${word(h4)}`), ok: trend !== null },
  ];
  const latest = reading(m15.length - 1);
  const checks = checksAt(latest);
  if (hour < 7) return { ...off(t("Азийн хүрээ бүрдэж байна", "The Asian range is forming"), t(`Хүрээ ${ub("15:00")} (${zone}) цагт хаагдана. Түүний дараа хүрээнээс гарсан эхний 15 минутын хаалтыг харна.`, `The range closes at ${ub("15:00")} (${zone}). After that, the first 15-minute close outside the range is what counts.`)), status: "FORMING", band, checks };
  if (!band || range.length < ASIAN_MIN_BARS) return off(t("Өнөөдрийн хүрээний дата дутуу", "Today's range data is incomplete"), t("Азийн сессийн 15 минутын лаа хангалттай ирээгүй тул өнөөдөр энэ setup-ыг тооцохгүй.", "Not enough 15-minute candles arrived for the Asian session, so this setup is not counted today."), { band, checks });

  const mid = (band.high + band.low) / 2;
  const sideWordOf = (s: Side) => (s === "BUY" ? t("дээш", "above") : t("доош", "below"));
  // Exactly what the replay does: each close is judged with the trends it had; a close on the wrong side,
  // with the trends apart, or inside a news window is passed over and the rule keeps waiting.
  const breakout = bars.find((b) => {
    const h = b.time.getUTCHours();
    if (h < 7 || h >= 16) return false;
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
    const need = atr === null || !Number.isFinite(atr) ? Infinity : ASIAN_MIN_STOP_ATR * atr;
    if (!(Math.abs(breakout.close - mid) >= need)) {
      const narrow = { label: t(`Stop өдрийн ATR-ийн ${ASIAN_MIN_STOP_ATR}-аас их`, `Stop at least ${ASIAN_MIN_STOP_ATR} of the daily ATR`), ok: false };
      return off(t("Хүрээ хэт нарийн, өнөөдөр орохгүй", "Range too narrow, no trade today"), t(`Breakout гарсан ч stop ${px(Math.abs(breakout.close - mid))}$ нь өдрийн дундаж хэлбэлзлийн (ATR ${Number.isFinite(need) ? px(atr!) : "—"}$) дөрөвний нэгээс бага. Ийм нарийн хүрээний breakout түүхэнд ихэвчлэн хуурамч гарсан тул алгасна.`, `A breakout came, but its stop of $${px(Math.abs(breakout.close - mid))} is under a quarter of the day's usual move (ATR $${Number.isFinite(need) ? px(atr!) : "—"}). Breakouts from ranges this narrow were mostly false in the past, so the day is passed.`), { band, checks: [...done, narrow] });
    }
    const entry = breakout.close, dist = Math.abs(entry - mid), target = entry + dir * dist * ASIAN_RR;
    const levels = { side: trend, band, entry, stop: mid, target, at: new Date(breakout.time.getTime() + M15) };
    // Walk the bars after the entry exactly as the replay does: a bar touching both counts as the stop.
    const after = bars.filter((b) => b.time.getTime() > breakout.time.getTime() && b.time.getUTCHours() < 20);
    const exit = after.find((b) => (dir > 0 ? b.low <= mid : b.high >= mid) || (dir > 0 ? b.high >= target : b.low <= target));
    if (exit) {
      const stopped = dir > 0 ? exit.low <= mid : exit.high >= mid;
      const when = `${v.time(new Date(exit.time.getTime() + M15))} (${zone})`;
      return { ...off(
        stopped ? t(`${trend} хаагдсан: stop-д хүрсэн (−1R)`, `${trend} closed: stop hit (−1R)`) : t(`${trend} хаагдсан: target-д хүрсэн (+${ASIAN_RR}R)`, `${trend} closed: target hit (+${ASIAN_RR}R)`),
        stopped
          ? t(`Өнөөдрийн арилжаа ${when} цагт stop ${px(mid)}-д хүрч хаагдсан. Шинээр орохгүй. Маргаашийн хүрээг хүлээнэ.`, `Today's trade hit its stop at ${px(mid)} at ${when}. No new entry. Waiting for tomorrow's range.`)
          : t(`Өнөөдрийн арилжаа ${when} цагт target ${px(target)}-д хүрч хаагдсан. Шинээр орохгүй. Маргаашийн хүрээг хүлээнэ.`, `Today's trade reached its target at ${px(target)} at ${when}. No new entry. Waiting for tomorrow's range.`),
        { checks: done }), ...levels, result: stopped ? -1 : ASIAN_RR };
    }
    if (hour >= 20) {
      const lastBar = after.at(-1) ?? breakout;
      const r = Math.round(((dir * (lastBar.close - entry)) / dist) * 100) / 100;
      return { ...off(t(`${trend} цагаар хаагдсан (${r >= 0 ? "+" : ""}${r.toFixed(2)}R)`, `${trend} closed on time (${r >= 0 ? "+" : ""}${r.toFixed(2)}R)`), t(`Stop, target аль нь ч хүрээгүй тул ${ub("04:00")} (${zone}) цагт ${px(lastBar.close)} үнээр хаагдсан. Маргаашийн хүрээг хүлээнэ.`, `Neither the stop nor the target was hit, so it was closed at ${px(lastBar.close)} at ${ub("04:00")} (${zone}). Waiting for tomorrow's range.`), { checks: done }), ...levels, result: r };
    }
    return {
      status: "ACTIVE", checks: done, ...levels,
      headline: t(`${trend}: хүрээнээс ${sideWord} гарлаа`, `${trend}: broke ${sideWord} the range`),
      detail: t(`15 минутын лаа ${px(entry)} дээр хүрээний гадна, трендийн чиглэлд хаагдсан. Stop нь хүрээний дунд, target нь stop-оос ${ASIAN_RR} дахин хол. ${ub("04:00")} (${zone}) гэхэд хүрээгүй бол хаана.`, `A 15-minute candle closed outside the range at ${px(entry)}, in the direction of the trend. The stop is the middle of the range and the target is ${ASIAN_RR} times as far. If neither is hit by ${ub("04:00")} (${zone}), it is closed.`),
    };
  }
  if (hour >= 16) return off(t("Өнөөдөр breakout гараагүй", "No breakout today"), t(`Орох цонх ${ub("00:00")} (${zone}) цагт хаагдсан. Маргаашийн хүрээг хүлээнэ.`, `The entry window closed at ${ub("00:00")} (${zone}). Waiting for tomorrow's range.`), { band, checks });
  const trend = latest.trend;
  if (!trend) return off(latest.daily === null ? t("Өдрийн тренд тодорхойгүй", "Daily trend is unclear") : t("4 цагийн тренд өдрийнхтэй зөрж байна", "The 4-hour trend disagrees with the daily"), t("Энэ дүрэм өдөр, 4 цагийн тренд нэг чиглэлд байхад л тэр чиглэлд breakout авдаг. Хоёулаа таарах хүртэл орохгүй.", "This rule takes a breakout only when the daily and 4-hour trends point the same way, and only in that direction. Until they agree there is no entry."), { band, checks });
  const dir = trend === "BUY" ? 1 : -1;
  const sideWord = sideWordOf(trend);
  const level = trend === "BUY" ? band.high : band.low;
  const dist = Math.abs(level - mid);
  return {
    status: "WATCH", side: trend, band, checks: [...checks, { label: t(`Хүрээнээс ${sideWord} хаагдсан (мэдээний цонхноос гадуур)`, `Closed ${sideWord} the range (outside a news window)`), ok: false }],
    headline: t(`${trend} боломж: ${px(level)}-аас ${sideWord} хаагдвал`, `${trend} possible: on a close ${sideWord} ${px(level)}`),
    detail: t(`15 минутын лаа ${px(level)}-аас ${sideWord} хаагдвал ${trend} орох scenario. Эсрэг тал руу гарсан хаалтыг авахгүй. Stop хүрээний дунд (${px(mid)}), target ойролцоогоор ${px(level + dir * dist * ASIAN_RR)}. Бодит түвшин хаагдсан үнээс тооцогдоно. Цонх ${ub("00:00")} (${zone}) хүртэл.`, `If a 15-minute candle closes ${sideWord} ${px(level)}, the scenario is a ${trend} entry. A close out the other side is not taken. Stop at the middle of the range (${px(mid)}), target near ${px(level + dir * dist * ASIAN_RR)}. The real levels are worked out from the closing price. The window runs until ${ub("00:00")} (${zone}).`),
    entry: level, stop: mid, target: level + dir * dist * ASIAN_RR,
  };
}

export const MIN_HISTORY = 30;

/** How the rule did when replayed over stored history. No percentage from fewer than MIN_HISTORY trades. */
export function historyOf(trades: { r: number }[]): SetupHistory {
  const n = trades.length;
  if (n < MIN_HISTORY) return { n, winPct: null, avgR: null, profitFactor: null };
  let wins = 0, gain = 0, loss = 0;
  for (const { r } of trades) { if (r > 0) { wins++; gain += r; } else loss -= r; }
  return { n, winPct: Math.round((wins / n) * 1000) / 10, avgR: Math.round(((gain - loss) / n) * 1000) / 1000, profitFactor: loss > 0 ? gain / loss : null };
}
