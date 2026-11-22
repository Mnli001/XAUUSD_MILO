import type { Candle } from "../analysis/indicators";
import { type BotParams, type Side, DEFAULT_PARAMS, inNewsWindow } from "../bot/strategy";
import { MN_VIEWER, type Viewer } from "../viewer";

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
};

const M15 = 15 * 6e4;
const PARAMS: BotParams = DEFAULT_PARAMS;
const px = (v: number) => v.toFixed(2);
const off = (headline: string, detail: string, extra: Partial<SetupNow> = {}): SetupNow =>
  ({ status: "OFF", side: null, headline, detail, entry: null, stop: null, target: null, band: null, checks: [], ...extra });
const marketClosed = (now: Date) => { const d = now.getUTCDay(); return d === 6 || d === 0; };

export const ASIAN_RR = 2;
export const ASIAN_MIN_BARS = 20;

/**
 * Asian range breakout with the daily trend. Range: 00:00–07:00 UTC (08:00–15:00 UB).
 * From 07:00 to 16:00 UTC the first 15-minute close outside it, in the trend's direction, is the entry;
 * stop at the middle of the range, target twice the stop, flat by 20:00 UTC.
 */
export function asianSetup(m15: Candle[], dailyScore: number | null, news: Date[], now: Date, v: Viewer = MN_VIEWER): SetupNow {
  const { t, ub, zone } = v;
  if (marketClosed(now)) return off(t("Зах хаалттай", "Market closed"), t(`Алтны зах даваа гарагийн өглөө нээгдэнэ. Азийн хүрээ тэр өдөр ${ub("08:00")}–${ub("15:00")} (${zone}) цагт бүрдэнэ.`, `The gold market reopens after the weekend. The Asian range then forms between ${ub("08:00")} and ${ub("15:00")} (${zone}).`));
  const today = now.toISOString().slice(0, 10);
  const bars = m15.filter((b) => b.time.toISOString().slice(0, 10) === today && b.time.getTime() + M15 <= now.getTime());
  const range = bars.filter((b) => b.time.getUTCHours() < 7);
  const band = range.length ? { high: Math.max(...range.map((b) => b.high)), low: Math.min(...range.map((b) => b.low)) } : null;
  const hour = now.getUTCHours();
  const trend: Side | null = dailyScore === null || dailyScore === 0 ? null : dailyScore > 0 ? "BUY" : "SELL";
  const checks = [
    { label: t(`Азийн хүрээ бүрдсэн (${ub("15:00")} ${zone})`, `Asian range complete (${ub("15:00")} ${zone})`), ok: hour >= 7 && range.length >= ASIAN_MIN_BARS },
    { label: t(`Өдрийн тренд тодорхой${trend ? (trend === "BUY" ? " (дээш)" : " (доош)") : ""}`, `Daily trend is clear${trend ? (trend === "BUY" ? " (up)" : " (down)") : ""}`), ok: trend !== null },
  ];
  if (hour < 7) return { ...off(t("Азийн хүрээ бүрдэж байна", "The Asian range is forming"), t(`Хүрээ ${ub("15:00")} (${zone}) цагт хаагдана. Түүний дараа хүрээнээс гарсан эхний 15 минутын хаалтыг харна.`, `The range closes at ${ub("15:00")} (${zone}). After that, the first 15-minute close outside the range is what counts.`)), status: "FORMING", band, checks };
  if (!band || range.length < ASIAN_MIN_BARS) return off(t("Өнөөдрийн хүрээний дата дутуу", "Today's range data is incomplete"), t("Азийн сессийн 15 минутын лаа хангалттай ирээгүй тул өнөөдөр энэ setup-ыг тооцохгүй.", "Not enough 15-minute candles arrived for the Asian session, so this setup is not counted today."), { band, checks });

  const mid = (band.high + band.low) / 2;
  if (!trend) return off(t("Өдрийн тренд тодорхойгүй", "Daily trend is unclear"), t("Энэ дүрэм зөвхөн өдрийн трендийн чиглэлд breakout авдаг. Тренд тодортол хүлээнэ.", "This rule takes a breakout only in the direction of the daily trend. It waits until the trend is clear."), { band, checks });
  const dir = trend === "BUY" ? 1 : -1;
  const sideWord = trend === "BUY" ? t("дээш", "above") : t("доош", "below");
  // Exactly what the replay does: a close on the wrong side, or inside a news window, is passed over and the rule keeps waiting.
  const breakout = bars.find((b) => {
    const h = b.time.getUTCHours();
    return h >= 7 && h < 16 && (trend === "BUY" ? b.close > band.high : b.close < band.low) && !inNewsWindow(new Date(b.time.getTime() + M15), news, PARAMS);
  });
  if (breakout) {
    const done = [...checks, { label: t(`Хүрээнээс ${sideWord} хаагдсан (мэдээний цонхноос гадуур)`, `Closed ${sideWord} the range (outside a news window)`), ok: true }];
    if (hour >= 20) return off(t("Өнөөдрийн setup дууссан", "Today's setup is over"), t(`Энэ дүрмийн арилжаа ${ub("04:00")} (${zone}) цагт хаагддаг. Маргаашийн хүрээг хүлээнэ.`, `Trades on this rule close at ${ub("04:00")} (${zone}). Waiting for tomorrow's range.`), { band, checks: done });
    const dist = Math.abs(breakout.close - mid);
    return {
      status: "ACTIVE", side: trend, band, checks: done,
      headline: t(`${trend}: хүрээнээс ${sideWord} гарлаа`, `${trend}: broke ${sideWord} the range`),
      detail: t(`15 минутын лаа ${px(breakout.close)} дээр хүрээний гадна, трендийн чиглэлд хаагдсан. Stop нь хүрээний дунд, target нь stop-оос ${ASIAN_RR} дахин хол. ${ub("04:00")} (${zone}) гэхэд хүрээгүй бол хаана.`, `A 15-minute candle closed outside the range at ${px(breakout.close)}, in the direction of the trend. The stop is the middle of the range and the target is ${ASIAN_RR} times as far. If neither is hit by ${ub("04:00")} (${zone}), it is closed.`),
      entry: breakout.close, stop: mid, target: breakout.close + dir * dist * ASIAN_RR,
    };
  }
  if (hour >= 16) return off(t("Өнөөдөр breakout гараагүй", "No breakout today"), t(`Орох цонх ${ub("00:00")} (${zone}) цагт хаагдсан. Маргаашийн хүрээг хүлээнэ.`, `The entry window closed at ${ub("00:00")} (${zone}). Waiting for tomorrow's range.`), { band, checks });
  const level = trend === "BUY" ? band.high : band.low;
  const dist = Math.abs(level - mid);
  return {
    status: "WATCH", side: trend, band, checks: [...checks, { label: t(`Хүрээнээс ${sideWord} хаагдсан (мэдээний цонхноос гадуур)`, `Closed ${sideWord} the range (outside a news window)`), ok: false }],
    headline: t(`${trend} боломж: ${px(level)}-аас ${sideWord} хаагдвал`, `${trend} possible: on a close ${sideWord} ${px(level)}`),
    detail: t(`15 минутын лаа ${px(level)}-аас ${sideWord} хаагдвал ${trend} орох scenario. Эсрэг тал руу гарсан хаалтыг авахгүй. Stop хүрээний дунд (${px(mid)}), target ойролцоогоор ${px(level + dir * dist * ASIAN_RR)}. Бодит түвшин хаагдсан үнээс тооцогдоно. Цонх ${ub("00:00")} (${zone}) хүртэл.`, `If a 15-minute candle closes ${sideWord} ${px(level)}, the scenario is a ${trend} entry. A close out the other side is not taken. Stop at the middle of the range (${px(mid)}), target near ${px(level + dir * dist * ASIAN_RR)}. The real levels are worked out from the closing price. The window runs until ${ub("00:00")} (${zone}).`),
    entry: level, stop: mid, target: level + dir * dist * ASIAN_RR,
  };
}

export const DIP_RSI = 30;

/**
 * Buy a dip in an up trend (sell a rally in a down trend): daily and 4-hour scores agree, and the
 * 15-minute RSI is below 30 (above 70 for shorts). Stop 2 ATR, target 1.5 ATR, out after 8 hours.
 */
export function dipSetup(m15: Candle[], ind: { rsi: number; atr: number; daily: number | null; h4: number | null }, news: Date[], now: Date, v: Viewer = MN_VIEWER): SetupNow {
  const { t } = v;
  if (marketClosed(now)) return off(t("Зах хаалттай", "Market closed"), t("Алтны зах даваа гарагийн өглөө нээгдэнэ.", "The gold market reopens after the weekend."));
  const last = m15.at(-1);
  if (!last || !Number.isFinite(ind.rsi) || !Number.isFinite(ind.atr) || ind.atr <= 0) return off(t("Дата ачаалж байна", "Loading data"), t("15 минутын RSI, ATR тооцоход лаа хангалтгүй байна.", "Not enough candles to work out the 15-minute RSI and ATR."));
  const { daily: d, h4: h } = ind;
  const side: Side | null = d !== null && h !== null && d > 0 && h > 0 ? "BUY" : d !== null && h !== null && d < 0 && h < 0 ? "SELL" : null;
  const trendCheck = { label: t(`Өдөр, 4 цагийн тренд нэг чиглэлд${side ? (side === "BUY" ? " (дээш)" : " (доош)") : ""}`, `Daily and 4-hour trends agree${side ? (side === "BUY" ? " (up)" : " (down)") : ""}`), ok: side !== null };
  if (!side) return off(t("Өдөр, 4 цагийн тренд зөрж байна", "Daily and 4-hour trends disagree"), t("Энэ дүрэм хоёр трендийг нэг чиглэлд байхыг шаарддаг. Таарах хүртэл хүлээнэ.", "This rule needs both trends to point the same way. It waits until they do."), { checks: [trendCheck] });
  const trigger = side === "BUY" ? DIP_RSI : 100 - DIP_RSI;
  const hit = side === "BUY" ? ind.rsi < trigger : ind.rsi > trigger;
  const checks = [trendCheck, { label: t(`15 минутын RSI ${side === "BUY" ? `${trigger}-аас доош` : `${trigger}-аас дээш`} (одоо ${ind.rsi.toFixed(0)})`, `15-minute RSI ${side === "BUY" ? `below ${trigger}` : `above ${trigger}`} (now ${ind.rsi.toFixed(0)})`), ok: hit }];
  if (inNewsWindow(now, news, PARAMS)) return off(t("Чухал мэдээний цонх", "Important news window"), t("Мэдээний өмнөх 30, дараах 60 минутад энэ дүрэм ордоггүй.", "This rule does not enter in the 30 minutes before or the 60 minutes after a release."), { checks: [...checks, { label: t("Мэдээний цонхноос гадуур", "Outside a news window"), ok: false }] });
  const dir = side === "BUY" ? 1 : -1;
  const levels = { entry: last.close, stop: last.close - dir * 2 * ind.atr, target: last.close + dir * 1.5 * ind.atr };
  if (hit) {
    return { status: "ACTIVE", side, band: null, checks, ...levels,
      headline: t(`${side}: тренд доторх ${side === "BUY" ? "уналт" : "өсөлт"}`, `${side}: ${side === "BUY" ? "dip" : "rally"} within the trend`),
      detail: t(`RSI ${ind.rsi.toFixed(0)} болж ${side === "BUY" ? "хэт зарагдсан" : "хэт авагдсан"} бүсэд орлоо. Stop 2 ATR (${px(2 * ind.atr)}), target 1.5 ATR (${px(1.5 * ind.atr)}). 8 цагийн дотор хүрээгүй бол хаана.`, `RSI is at ${ind.rsi.toFixed(0)}, in ${side === "BUY" ? "oversold" : "overbought"} territory. Stop 2 ATR (${px(2 * ind.atr)}), target 1.5 ATR (${px(1.5 * ind.atr)}). Closed if neither is hit within 8 hours.`) };
  }
  return { status: "WATCH", side, band: null, checks, ...levels,
    headline: t(`${side} боломж: RSI ${trigger}-${side === "BUY" ? "аас доош орвол" : "аас дээш гарвал"}`, `${side} possible: if RSI ${side === "BUY" ? "drops below" : "rises above"} ${trigger}`),
    detail: t(`Тренд ${side === "BUY" ? "дээш" : "доош"}. 15 минутын RSI одоо ${ind.rsi.toFixed(0)}; ${trigger}-${side === "BUY" ? "аас доош орвол" : "аас дээш гарвал"} ${side} орох scenario. Зурагт одоогийн үнээс тооцсон stop, target-ыг харуулав; бодит түвшин орох мөчийн үнээс тооцогдоно.`, `Trend is ${side === "BUY" ? "up" : "down"}. The 15-minute RSI is now ${ind.rsi.toFixed(0)}; if it ${side === "BUY" ? "drops below" : "rises above"} ${trigger}, the scenario is a ${side} entry. The chart shows a stop and target worked out from the current price; the real levels are worked out from the price at entry.`) };
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
