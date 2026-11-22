import type { Candle } from "../analysis/indicators";
import { type BotParams, type Side, DEFAULT_PARAMS, inNewsWindow } from "../bot/strategy";

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
export function asianSetup(m15: Candle[], dailyScore: number | null, news: Date[], now: Date): SetupNow {
  if (marketClosed(now)) return off("Зах хаалттай", "Алтны зах даваа гарагийн өглөө нээгдэнэ. Азийн хүрээ тэр өдөр 08:00–15:00 (УБ) цагт бүрдэнэ.");
  const today = now.toISOString().slice(0, 10);
  const bars = m15.filter((b) => b.time.toISOString().slice(0, 10) === today && b.time.getTime() + M15 <= now.getTime());
  const range = bars.filter((b) => b.time.getUTCHours() < 7);
  const band = range.length ? { high: Math.max(...range.map((b) => b.high)), low: Math.min(...range.map((b) => b.low)) } : null;
  const hour = now.getUTCHours();
  const trend: Side | null = dailyScore === null || dailyScore === 0 ? null : dailyScore > 0 ? "BUY" : "SELL";
  const checks = [
    { label: "Азийн хүрээ бүрдсэн (15:00 УБ)", ok: hour >= 7 && range.length >= ASIAN_MIN_BARS },
    { label: `Өдрийн тренд тодорхой${trend ? (trend === "BUY" ? " (дээш)" : " (доош)") : ""}`, ok: trend !== null },
  ];
  if (hour < 7) return { ...off("Азийн хүрээ бүрдэж байна", "Хүрээ 15:00 (УБ) цагт хаагдана. Түүний дараа хүрээнээс гарсан эхний 15 минутын хаалтыг харна."), status: "FORMING", band, checks };
  if (!band || range.length < ASIAN_MIN_BARS) return off("Өнөөдрийн хүрээний дата дутуу", "Азийн сессийн 15 минутын лаа хангалттай ирээгүй тул өнөөдөр энэ setup-ыг тооцохгүй.", { band, checks });

  const mid = (band.high + band.low) / 2;
  const breakout = bars.find((b) => { const h = b.time.getUTCHours(); return h >= 7 && h < 16 && (b.close > band.high || b.close < band.low); });
  if (breakout) {
    const side: Side = breakout.close > band.high ? "BUY" : "SELL";
    const dir = side === "BUY" ? 1 : -1;
    const done = [...checks, { label: `Хүрээнээс ${side === "BUY" ? "дээш" : "доош"} хаагдсан`, ok: true }];
    if (side !== trend) return off("Breakout гарсан ч алгаслаа", `Үнэ хүрээнээс ${side === "BUY" ? "дээш" : "доош"} гарсан боловч өдрийн тренд ${trend ? "эсрэг чиглэлтэй" : "тодорхойгүй"} байна. Энэ дүрэм өдөрт нэг л breakout авдаг.`, { band, checks: [...done, { label: "Тренд breakout-тай нэг чиглэлд", ok: false }] });
    if (inNewsWindow(new Date(breakout.time.getTime() + M15), news, PARAMS)) return off("Breakout мэдээний үеэр гарсан", "Чухал мэдээний өмнөх 30, дараах 60 минутад гарсан breakout-ыг энэ дүрэм авдаггүй.", { band, checks: [...done, { label: "Мэдээний цонхноос гадуур", ok: false }] });
    if (hour >= 20) return off("Өнөөдрийн setup дууссан", "Энэ дүрмийн арилжаа 04:00 (УБ) цагт хаагддаг. Маргаашийн хүрээг хүлээнэ.", { band, checks: done });
    const dist = Math.abs(breakout.close - mid);
    return {
      status: "ACTIVE", side, band, checks: [...done, { label: "Тренд breakout-тай нэг чиглэлд", ok: true }],
      headline: `${side}: хүрээнээс ${side === "BUY" ? "дээш" : "доош"} гарлаа`,
      detail: `15 минутын лаа ${px(breakout.close)} дээр хүрээний гадна хаагдсан. Stop нь хүрээний дунд, target нь stop-оос ${ASIAN_RR} дахин хол. 04:00 (УБ) гэхэд хүрээгүй бол хаана.`,
      entry: breakout.close, stop: mid, target: breakout.close + dir * dist * ASIAN_RR,
    };
  }
  if (hour >= 16) return off("Өнөөдөр breakout гараагүй", "Орох цонх 00:00 (УБ) цагт хаагдсан. Маргаашийн хүрээг хүлээнэ.", { band, checks });
  if (!trend) return off("Өдрийн тренд тодорхойгүй", "Энэ дүрэм зөвхөн өдрийн трендийн чиглэлд breakout авдаг. Тренд тодортол хүлээнэ.", { band, checks });
  const level = trend === "BUY" ? band.high : band.low;
  const dir = trend === "BUY" ? 1 : -1;
  const dist = Math.abs(level - mid);
  return {
    status: "WATCH", side: trend, band, checks: [...checks, { label: `Хүрээнээс ${trend === "BUY" ? "дээш" : "доош"} хаагдсан`, ok: false }],
    headline: `${trend} боломж: ${px(level)}-${trend === "BUY" ? "аас дээш" : "аас доош"} хаагдвал`,
    detail: `15 минутын лаа ${px(level)}-${trend === "BUY" ? "аас дээш" : "аас доош"} хаагдвал ${trend} орох scenario. Stop хүрээний дунд (${px(mid)}), target ойролцоогоор ${px(level + dir * dist * ASIAN_RR)}. Бодит түвшин хаагдсан үнээс тооцогдоно. Цонх 00:00 (УБ) хүртэл.`,
    entry: level, stop: mid, target: level + dir * dist * ASIAN_RR,
  };
}

export const DIP_RSI = 30;

/**
 * Buy a dip in an up trend (sell a rally in a down trend): daily and 4-hour scores agree, and the
 * 15-minute RSI is below 30 (above 70 for shorts). Stop 2 ATR, target 1.5 ATR, out after 8 hours.
 */
export function dipSetup(m15: Candle[], ind: { rsi: number; atr: number; daily: number | null; h4: number | null }, news: Date[], now: Date): SetupNow {
  if (marketClosed(now)) return off("Зах хаалттай", "Алтны зах даваа гарагийн өглөө нээгдэнэ.");
  const last = m15.at(-1);
  if (!last || !Number.isFinite(ind.rsi) || !Number.isFinite(ind.atr) || ind.atr <= 0) return off("Дата ачаалж байна", "15 минутын RSI, ATR тооцоход лаа хангалтгүй байна.");
  const { daily: d, h4: h } = ind;
  const side: Side | null = d !== null && h !== null && d > 0 && h > 0 ? "BUY" : d !== null && h !== null && d < 0 && h < 0 ? "SELL" : null;
  const trendCheck = { label: `Өдөр, 4 цагийн тренд нэг чиглэлд${side ? (side === "BUY" ? " (дээш)" : " (доош)") : ""}`, ok: side !== null };
  if (!side) return off("Өдөр, 4 цагийн тренд зөрж байна", "Энэ дүрэм хоёр трендийг нэг чиглэлд байхыг шаарддаг. Таарах хүртэл хүлээнэ.", { checks: [trendCheck] });
  const trigger = side === "BUY" ? DIP_RSI : 100 - DIP_RSI;
  const hit = side === "BUY" ? ind.rsi < trigger : ind.rsi > trigger;
  const checks = [trendCheck, { label: `15 минутын RSI ${side === "BUY" ? `${trigger}-аас доош` : `${trigger}-аас дээш`} (одоо ${ind.rsi.toFixed(0)})`, ok: hit }];
  if (inNewsWindow(now, news, PARAMS)) return off("Чухал мэдээний цонх", "Мэдээний өмнөх 30, дараах 60 минутад энэ дүрэм ордоггүй.", { checks: [...checks, { label: "Мэдээний цонхноос гадуур", ok: false }] });
  const dir = side === "BUY" ? 1 : -1;
  const levels = { entry: last.close, stop: last.close - dir * 2 * ind.atr, target: last.close + dir * 1.5 * ind.atr };
  if (hit) {
    return { status: "ACTIVE", side, band: null, checks, ...levels,
      headline: `${side}: тренд доторх ${side === "BUY" ? "уналт" : "өсөлт"}`,
      detail: `RSI ${ind.rsi.toFixed(0)} болж ${side === "BUY" ? "хэт зарагдсан" : "хэт авагдсан"} бүсэд орлоо. Stop 2 ATR (${px(2 * ind.atr)}), target 1.5 ATR (${px(1.5 * ind.atr)}). 8 цагийн дотор хүрээгүй бол хаана.` };
  }
  return { status: "WATCH", side, band: null, checks, ...levels,
    headline: `${side} боломж: RSI ${trigger}-${side === "BUY" ? "аас доош орвол" : "аас дээш гарвал"}`,
    detail: `Тренд ${side === "BUY" ? "дээш" : "доош"}. 15 минутын RSI одоо ${ind.rsi.toFixed(0)}; ${trigger}-${side === "BUY" ? "аас доош орвол" : "аас дээш гарвал"} ${side} орох scenario. Зурагт одоогийн үнээс тооцсон stop, target-ыг харуулав; бодит түвшин орох мөчийн үнээс тооцогдоно.` };
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
