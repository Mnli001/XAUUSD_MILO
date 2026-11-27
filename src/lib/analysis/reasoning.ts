import { type Candle, atr, ema, macdHist, rsi } from "./indicators";
import { pivots } from "./levels";
import type { T } from "../i18n";
import { ubDateKey, ubLocalToUtc } from "../time";

/*
 * The same market read through the methods traders most often use, each on its own terms: what it
 * looks at, what it sees right now, and which way that points. Nothing here is a tested rule. The
 * readings are descriptions of the chart, put side by side so that agreement and disagreement show.
 */

export type Verdict = "BUY" | "SELL" | "NEUTRAL";
export type Family = "trend" | "momentum" | "reversion" | "breakout" | "structure" | "levels";
export type Reading = {
  id: string;
  name: string;
  family: Family;
  timeframe: string; // the chart it was read on, as people write it: M15, H1, H4, D1
  verdict: Verdict;
  reason: string; // what it sees, with the numbers
  levels: { label: string; price: number }[]; // prices this method cares about, for the eye
};
export type Plan = { side: "BUY" | "SELL"; entry: number; stop: number; target: number; rr: number; atr: number };
export type Reasoning = {
  price: number;
  readings: Reading[];
  buy: number;
  sell: number;
  neutral: number;
  verdict: Verdict;
  /** −100…+100: every method for BUY is +100, every method for SELL is −100. */
  score: number;
  families: { family: Family; name: string; verdict: Verdict; buy: number; sell: number; n: number }[];
  plan: Plan | null; // reference levels from volatility, only when the methods lean one way
  /** ATR(14) on the 1-hour chart, in dollars; NaN or 0 when there are too few candles. */
  atrH1: number;
};

export type ReasoningInput = { m15: Candle[]; h1: Candle[]; h4: Candle[]; d1: Candle[]; price: number; now: Date };

/** How lopsided the count must be before the whole is called one way: a quarter of the methods, net. */
export const LEAN = 25;
export const PLAN_STOP_ATR = 1.5;
export const PLAN_RR = 2;

const px = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const last = <V,>(a: V[]) => a[a.length - 1];
const highest = (c: Candle[]) => Math.max(...c.map((x) => x.high));
const lowest = (c: Candle[]) => Math.min(...c.map((x) => x.low));

export const familyName = (f: Family, t: T): string => ({
  trend: t("Trend дагах", "Trend following"),
  momentum: t("Momentum", "Momentum"),
  reversion: t("Буцалт", "Mean reversion"),
  breakout: t("Breakout", "Breakout"),
  structure: t("Бүтэц (ICT / SMC)", "Structure (ICT / SMC)"),
  levels: t("Түвшин", "Levels"),
}[f]);

/** Swing points with where they sit, so that order in time can be compared. */
function swingPoints(c: Candle[], wing = 2): { highs: { i: number; v: number }[]; lows: { i: number; v: number }[] } {
  const highs: { i: number; v: number }[] = [];
  const lows: { i: number; v: number }[] = [];
  for (let i = wing; i < c.length - wing; i++) {
    let hi = true, lo = true;
    for (let k = 1; k <= wing; k++) {
      if (!(c[i].high > c[i - k].high && c[i].high > c[i + k].high)) hi = false;
      if (!(c[i].low < c[i - k].low && c[i].low < c[i + k].low)) lo = false;
    }
    if (hi) highs.push({ i, v: c[i].high });
    if (lo) lows.push({ i, v: c[i].low });
  }
  return { highs, lows };
}

type Read = (x: ReasoningInput, t: T) => Reading | null;
const make = (id: string, family: Family, timeframe: string, name: string, verdict: Verdict, reason: string, levels: Reading["levels"] = []): Reading => ({ id, family, timeframe, name, verdict, reason, levels });

/** EMA 20 / 50 / 200 in order, with price on the right side of them. */
const emaStack: Read = ({ h1, price }, t) => {
  if (h1.length < 210) return null;
  const closes = h1.map((c) => c.close);
  const e20 = last(ema(closes, 20)), e50 = last(ema(closes, 50)), e200 = last(ema(closes, 200));
  const name = t("EMA 20 / 50 / 200 эгнээ", "EMA 20 / 50 / 200 stack");
  const levels = [{ label: "EMA20", price: e20 }, { label: "EMA50", price: e50 }, { label: "EMA200", price: e200 }];
  if (price > e20 && e20 > e50 && e50 > e200) return make("ema-stack", "trend", "H1", name, "BUY", t(`Үнэ ${px(price)} нь EMA20 (${px(e20)}) > EMA50 (${px(e50)}) > EMA200 (${px(e200)}) эгнээний дээр. Гурван дундаж өсөх дарааллаар жагссан.`, `Price ${px(price)} is above EMA20 (${px(e20)}) > EMA50 (${px(e50)}) > EMA200 (${px(e200)}). The three averages are lined up for a rise.`), levels);
  if (price < e20 && e20 < e50 && e50 < e200) return make("ema-stack", "trend", "H1", name, "SELL", t(`Үнэ ${px(price)} нь EMA20 (${px(e20)}) < EMA50 (${px(e50)}) < EMA200 (${px(e200)}) эгнээний доор. Гурван дундаж унах дарааллаар жагссан.`, `Price ${px(price)} is below EMA20 (${px(e20)}) < EMA50 (${px(e50)}) < EMA200 (${px(e200)}). The three averages are lined up for a fall.`), levels);
  return make("ema-stack", "trend", "H1", name, "NEUTRAL", t(`Дунджууд нэг дараалалд ороогүй: EMA20 ${px(e20)}, EMA50 ${px(e50)}, EMA200 ${px(e200)}, үнэ ${px(price)}. Trend цэвэр биш.`, `The averages are not in one order: EMA20 ${px(e20)}, EMA50 ${px(e50)}, EMA200 ${px(e200)}, price ${px(price)}. The trend is not clean.`), levels);
};

/** The 50 over the 200 on the 4-hour chart: the golden cross and the death cross. */
const goldenCross: Read = ({ h4 }, t) => {
  if (h4.length < 215) return null;
  const closes = h4.map((c) => c.close);
  const e50 = ema(closes, 50), e200 = ema(closes, 200);
  const a = last(e50), b = last(e200);
  const gap = ((a - b) / b) * 100;
  let since = 0;
  for (let i = closes.length - 2; i >= 200 && Math.sign(e50[i] - e200[i]) === Math.sign(a - b); i--) since++;
  const name = t("Golden / Death cross (EMA50 ба EMA200)", "Golden / death cross (EMA50 vs EMA200)");
  const levels = [{ label: "EMA50", price: a }, { label: "EMA200", price: b }];
  if (Math.abs(gap) < 0.05) return make("golden-cross", "trend", "H4", name, "NEUTRAL", t(`EMA50 (${px(a)}) ба EMA200 (${px(b)}) бараг давхцаж байна. Огтлолцол шийдэгдээгүй.`, `EMA50 (${px(a)}) and EMA200 (${px(b)}) nearly touch. The cross is undecided.`), levels);
  return a > b
    ? make("golden-cross", "trend", "H4", name, "BUY", t(`EMA50 (${px(a)}) нь EMA200 (${px(b)})-ийн дээр ${since + 1} лааны турш байна (зөрүү ${gap.toFixed(2)}%). Урт хугацааны чиглэл өгсөх.`, `EMA50 (${px(a)}) has been above EMA200 (${px(b)}) for ${since + 1} bars (gap ${gap.toFixed(2)}%). The longer direction is up.`), levels)
    : make("golden-cross", "trend", "H4", name, "SELL", t(`EMA50 (${px(a)}) нь EMA200 (${px(b)})-ийн доор ${since + 1} лааны турш байна (зөрүү ${gap.toFixed(2)}%). Урт хугацааны чиглэл уруудах.`, `EMA50 (${px(a)}) has been below EMA200 (${px(b)}) for ${since + 1} bars (gap ${gap.toFixed(2)}%). The longer direction is down.`), levels);
};

/** Ichimoku on the 4-hour chart: price against the cloud, Tenkan against Kijun. */
const ichimoku: Read = ({ h4, price }, t) => {
  if (h4.length < 80) return null;
  const mid = (to: number, n: number) => { const s = h4.slice(to - n + 1, to + 1); return (highest(s) + lowest(s)) / 2; };
  const i = h4.length - 1;
  const tenkan = mid(i, 9), kijun = mid(i, 26);
  // the cloud over today's bar was drawn 26 bars ago
  const j = i - 26;
  const spanA = (mid(j, 9) + mid(j, 26)) / 2, spanB = mid(j, 52);
  const top = Math.max(spanA, spanB), bottom = Math.min(spanA, spanB);
  const name = t("Ichimoku үүл", "Ichimoku cloud");
  const levels = [{ label: t("Үүлний дээд", "Cloud top"), price: top }, { label: t("Үүлний доод", "Cloud bottom"), price: bottom }, { label: "Kijun", price: kijun }];
  if (price > top && tenkan >= kijun) return make("ichimoku", "trend", "H4", name, "BUY", t(`Үнэ үүлний дээр (${px(top)}), Tenkan ${px(tenkan)} нь Kijun ${px(kijun)}-ээс дээр. Үүл дэмжлэг болж байна.`, `Price is above the cloud (${px(top)}) and Tenkan ${px(tenkan)} is over Kijun ${px(kijun)}. The cloud is acting as support.`), levels);
  if (price < bottom && tenkan <= kijun) return make("ichimoku", "trend", "H4", name, "SELL", t(`Үнэ үүлний доор (${px(bottom)}), Tenkan ${px(tenkan)} нь Kijun ${px(kijun)}-ээс доор. Үүл эсэргүүцэл болж байна.`, `Price is below the cloud (${px(bottom)}) and Tenkan ${px(tenkan)} is under Kijun ${px(kijun)}. The cloud is acting as resistance.`), levels);
  return make("ichimoku", "trend", "H4", name, "NEUTRAL", price <= top && price >= bottom
    ? t(`Үнэ үүлний дотор (${px(bottom)} – ${px(top)}). Ichimoku-д энэ нь чиглэлгүй бүс.`, `Price is inside the cloud (${px(bottom)} – ${px(top)}). For Ichimoku that is a zone with no direction.`)
    : t(`Үнэ үүлнээс гарсан ч Tenkan (${px(tenkan)}) ба Kijun (${px(kijun)}) түүнийг батлаагүй.`, `Price has left the cloud but Tenkan (${px(tenkan)}) and Kijun (${px(kijun)}) do not confirm it.`), levels);
};

/** MACD histogram: which side of zero, and whether it is growing. */
const macd: Read = ({ h1 }, t) => {
  if (h1.length < 60) return null;
  const hist = macdHist(h1.map((c) => c.close));
  const a = last(hist), b = hist[hist.length - 2];
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const name = "MACD (12, 26, 9)";
  if (a > 0 && a >= b) return make("macd", "momentum", "H1", name, "BUY", t(`Гистограм тэгээс дээш (${a.toFixed(2)}) бөгөөд өсөж байна. Өсөх хүч нэмэгдэж байна.`, `The histogram is above zero (${a.toFixed(2)}) and growing. Upward force is building.`));
  if (a < 0 && a <= b) return make("macd", "momentum", "H1", name, "SELL", t(`Гистограм тэгээс доош (${a.toFixed(2)}) бөгөөд гүнзгийрч байна. Унах хүч нэмэгдэж байна.`, `The histogram is below zero (${a.toFixed(2)}) and deepening. Downward force is building.`));
  return make("macd", "momentum", "H1", name, "NEUTRAL", a > 0
    ? t(`Гистограм тэгээс дээш (${a.toFixed(2)}) боловч багасаж байна. Өсөх хүч суларч байна.`, `The histogram is above zero (${a.toFixed(2)}) but shrinking. Upward force is fading.`)
    : t(`Гистограм тэгээс доош (${a.toFixed(2)}) боловч дээшилж байна. Унах хүч суларч байна.`, `The histogram is below zero (${a.toFixed(2)}) but rising. Downward force is fading.`));
};

/** RSI as momentum: which half it lives in, short of the extremes. */
const rsiMomentum: Read = ({ h1 }, t) => {
  if (h1.length < 40) return null;
  const v = last(rsi(h1.map((c) => c.close)));
  if (Number.isNaN(v)) return null;
  const name = t("RSI (14) momentum", "RSI (14) momentum");
  const r = v.toFixed(0);
  if (v >= 55 && v < 70) return make("rsi-momentum", "momentum", "H1", name, "BUY", t(`RSI ${r}: 55-аас дээш, 70-д хүрээгүй. Худалдан авагчид давамгай, хэт халаагүй.`, `RSI ${r}: above 55 and short of 70. Buyers lead and it is not overheated.`));
  if (v <= 45 && v > 30) return make("rsi-momentum", "momentum", "H1", name, "SELL", t(`RSI ${r}: 45-аас доош, 30-д хүрээгүй. Худалдагчид давамгай, хэт унаагүй.`, `RSI ${r}: below 45 and short of 30. Sellers lead and it is not washed out.`));
  return make("rsi-momentum", "momentum", "H1", name, "NEUTRAL", v >= 70 || v <= 30
    ? t(`RSI ${r}: туйлын бүсэд орсон тул momentum гэж уншихгүй (доорх “RSI туйл”-ыг үз).`, `RSI ${r}: at an extreme, so it is not read as momentum (see “RSI extreme” below).`)
    : t(`RSI ${r}: 45–55 хооронд. Аль ч тал давамгайлаагүй.`, `RSI ${r}: between 45 and 55. Neither side leads.`));
};

/** RSI as exhaustion: over 70 is stretched up, under 30 is stretched down. */
const rsiExtreme: Read = ({ h1 }, t) => {
  if (h1.length < 40) return null;
  const v = last(rsi(h1.map((c) => c.close)));
  if (Number.isNaN(v)) return null;
  const name = t("RSI туйл (70 / 30)", "RSI extreme (70 / 30)");
  const r = v.toFixed(0);
  if (v >= 70) return make("rsi-extreme", "reversion", "H1", name, "SELL", t(`RSI ${r}: 70-аас дээш. Хэт их авагдсан, буцаж татагдах магадлалыг харна.`, `RSI ${r}: over 70. Overbought; this method looks for a pullback.`));
  if (v <= 30) return make("rsi-extreme", "reversion", "H1", name, "BUY", t(`RSI ${r}: 30-аас доош. Хэт их зарагдсан, сэргэх магадлалыг харна.`, `RSI ${r}: under 30. Oversold; this method looks for a bounce.`));
  return make("rsi-extreme", "reversion", "H1", name, "NEUTRAL", t(`RSI ${r}: 30–70 хооронд. Туйлд хүрээгүй тул буцалтын дохио алга.`, `RSI ${r}: between 30 and 70. No extreme, so no reversal reading.`));
};

/** Bollinger Bands (20, 2): a close outside a band is stretched and tends to come back toward the middle. */
const bollinger: Read = ({ h1, price }, t) => {
  if (h1.length < 25) return null;
  const closes = h1.slice(-20).map((c) => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / 20;
  const sd = Math.sqrt(closes.reduce((a, b) => a + (b - mean) ** 2, 0) / 20);
  if (!(sd > 0)) return null;
  const upper = mean + 2 * sd, lower = mean - 2 * sd;
  const b = ((price - lower) / (upper - lower)) * 100;
  const name = "Bollinger Bands (20, 2)";
  const levels = [{ label: t("Дээд зурвас", "Upper band"), price: upper }, { label: t("Дундаж", "Middle"), price: mean }, { label: t("Доод зурвас", "Lower band"), price: lower }];
  if (price >= upper) return make("bollinger", "reversion", "H1", name, "SELL", t(`Үнэ дээд зурвас ${px(upper)}-д хүрсэн буюу давсан. Дундаж ${px(mean)} руу буцах зай ${px(price - mean)}$.`, `Price is at or past the upper band ${px(upper)}. The way back to the middle ${px(mean)} is $${px(price - mean)}.`), levels);
  if (price <= lower) return make("bollinger", "reversion", "H1", name, "BUY", t(`Үнэ доод зурвас ${px(lower)}-д хүрсэн буюу давсан. Дундаж ${px(mean)} руу буцах зай ${px(mean - price)}$.`, `Price is at or past the lower band ${px(lower)}. The way back to the middle ${px(mean)} is $${px(mean - price)}.`), levels);
  return make("bollinger", "reversion", "H1", name, "NEUTRAL", t(`Үнэ зурвасын дотор, доороос ${b.toFixed(0)}%-д (${px(lower)} – ${px(upper)}). Сунасан гэх шалтгаан алга.`, `Price is inside the bands, ${b.toFixed(0)}% of the way up (${px(lower)} – ${px(upper)}). Nothing says it is stretched.`), levels);
};

/** Stochastic (14, 3): %K crossing %D inside the 20 or 80 zone. */
const stochastic: Read = ({ m15 }, t) => {
  if (m15.length < 20) return null;
  const k = (to: number) => { const s = m15.slice(to - 13, to + 1); const hi = highest(s), lo = lowest(s); return hi === lo ? 50 : ((m15[to].close - lo) / (hi - lo)) * 100; };
  const i = m15.length - 1;
  const ks = [k(i - 3), k(i - 2), k(i - 1), k(i)];
  const d = (ks[1] + ks[2] + ks[3]) / 3, dPrev = (ks[0] + ks[1] + ks[2]) / 3;
  const name = "Stochastic (14, 3)";
  const now = ks[3], prev = ks[2];
  if (now < 25 && prev <= dPrev && now > d) return make("stochastic", "reversion", "M15", name, "BUY", t(`%K ${now.toFixed(0)} нь 20-ийн бүсэд %D ${d.toFixed(0)}-г доороос огтолсон. Хэт зарагдсан бүсээс эргэх дохио.`, `%K ${now.toFixed(0)} crossed up through %D ${d.toFixed(0)} in the 20 zone. A turn out of oversold.`));
  if (now > 75 && prev >= dPrev && now < d) return make("stochastic", "reversion", "M15", name, "SELL", t(`%K ${now.toFixed(0)} нь 80-ийн бүсэд %D ${d.toFixed(0)}-г дээрээс огтолсон. Хэт авагдсан бүсээс эргэх дохио.`, `%K ${now.toFixed(0)} crossed down through %D ${d.toFixed(0)} in the 80 zone. A turn out of overbought.`));
  return make("stochastic", "reversion", "M15", name, "NEUTRAL", t(`%K ${now.toFixed(0)}, %D ${d.toFixed(0)}. Туйлын бүсэд огтлолцол гараагүй.`, `%K ${now.toFixed(0)}, %D ${d.toFixed(0)}. No cross inside an extreme zone.`));
};

/** Donchian / Turtle: a new 20-bar high or low on the 4-hour chart. */
const donchian: Read = ({ h4, price }, t) => {
  if (h4.length < 22) return null;
  const prior = h4.slice(-21, -1);
  const hi = highest(prior), lo = lowest(prior);
  const name = t("Donchian breakout (20 лаа)", "Donchian breakout (20 bars)");
  const levels = [{ label: t("20 лааны оргил", "20-bar high"), price: hi }, { label: t("20 лааны ёроол", "20-bar low"), price: lo }];
  if (price > hi) return make("donchian", "breakout", "H4", name, "BUY", t(`Үнэ сүүлийн 20 лааны оргил ${px(hi)}-ийг ${px(price - hi)}$-оор давсан. Шинэ оргил = breakout.`, `Price is $${px(price - hi)} past the 20-bar high ${px(hi)}. A new high is a breakout.`), levels);
  if (price < lo) return make("donchian", "breakout", "H4", name, "SELL", t(`Үнэ сүүлийн 20 лааны ёроол ${px(lo)}-ийг ${px(lo - price)}$-оор давсан. Шинэ ёроол = breakdown.`, `Price is $${px(lo - price)} past the 20-bar low ${px(lo)}. A new low is a breakdown.`), levels);
  return make("donchian", "breakout", "H4", name, "NEUTRAL", t(`Үнэ 20 лааны хүрээн дотор: оргил хүртэл ${px(hi - price)}$, ёроол хүртэл ${px(price - lo)}$.`, `Price is inside the 20-bar range: $${px(hi - price)} to the high, $${px(price - lo)} to the low.`), levels);
};

/** The Asian session's range (08:00–15:00 Ulaanbaatar) and which side price has left it on. */
const asianRange: Read = ({ m15, price, now }, t) => {
  const day = ubDateKey(now);
  const from = ubLocalToUtc(day, "08:00").getTime(), to = ubLocalToUtc(day, "15:00").getTime();
  if (now.getTime() < to) return null; // the range is still being built
  const bars = m15.filter((c) => c.time.getTime() >= from && c.time.getTime() < to);
  if (bars.length < 20) return null;
  const hi = highest(bars), lo = lowest(bars);
  const name = t("Азийн сешний хүрээ", "Asian session range");
  const levels = [{ label: t("Азийн оргил", "Asian high"), price: hi }, { label: t("Азийн ёроол", "Asian low"), price: lo }];
  if (price > hi) return make("asian-range", "breakout", "M15", name, "BUY", t(`Үнэ Азийн хүрээний оргил ${px(hi)}-ээс дээш гарсан (хүрээ ${px(hi - lo)}$). Лондон, Нью-Йорк дээш эвдсэн.`, `Price is above the Asian high ${px(hi)} (range $${px(hi - lo)}). London and New York broke it upward.`), levels);
  if (price < lo) return make("asian-range", "breakout", "M15", name, "SELL", t(`Үнэ Азийн хүрээний ёроол ${px(lo)}-оос доош гарсан (хүрээ ${px(hi - lo)}$). Лондон, Нью-Йорк доош эвдсэн.`, `Price is below the Asian low ${px(lo)} (range $${px(hi - lo)}). London and New York broke it downward.`), levels);
  return make("asian-range", "breakout", "M15", name, "NEUTRAL", t(`Үнэ Азийн хүрээн дотор хэвээр (${px(lo)} – ${px(hi)}). Эвдрэл гараагүй.`, `Price is still inside the Asian range (${px(lo)} – ${px(hi)}). No break yet.`), levels);
};

/** Market structure: higher highs and higher lows, or the reverse, and whether the last swing has been broken. */
const structure: Read = ({ h1, price }, t) => {
  if (h1.length < 60) return null;
  const { highs, lows } = swingPoints(h1.slice(-120));
  if (highs.length < 2 || lows.length < 2) return null;
  const [h0, h1v] = [highs[highs.length - 2].v, highs[highs.length - 1].v];
  const [l0, l1] = [lows[lows.length - 2].v, lows[lows.length - 1].v];
  const name = t("Зах зээлийн бүтэц (BOS / CHoCH)", "Market structure (BOS / CHoCH)");
  const levels = [{ label: t("Сүүлийн оргил", "Last swing high"), price: h1v }, { label: t("Сүүлийн ёроол", "Last swing low"), price: l1 }];
  const up = h1v > h0 && l1 > l0, down = h1v < h0 && l1 < l0;
  if (up && price >= l1) return make("structure", "structure", "H1", name, "BUY", price > h1v
    ? t(`Оргил ${px(h0)} → ${px(h1v)}, ёроол ${px(l0)} → ${px(l1)} өссөн, үнэ сүүлийн оргилыг давсан (BOS дээш).`, `Highs ${px(h0)} → ${px(h1v)} and lows ${px(l0)} → ${px(l1)} are rising, and price is past the last high (BOS up).`)
    : t(`Оргил ${px(h0)} → ${px(h1v)}, ёроол ${px(l0)} → ${px(l1)} өссөн. Сүүлийн ёроол ${px(l1)} эвдрээгүй цагт бүтэц өгсөх.`, `Highs ${px(h0)} → ${px(h1v)} and lows ${px(l0)} → ${px(l1)} are rising. While the last low ${px(l1)} holds, structure is up.`), levels);
  if (down && price <= h1v) return make("structure", "structure", "H1", name, "SELL", price < l1
    ? t(`Оргил ${px(h0)} → ${px(h1v)}, ёроол ${px(l0)} → ${px(l1)} буурсан, үнэ сүүлийн ёроолыг давсан (BOS доош).`, `Highs ${px(h0)} → ${px(h1v)} and lows ${px(l0)} → ${px(l1)} are falling, and price is past the last low (BOS down).`)
    : t(`Оргил ${px(h0)} → ${px(h1v)}, ёроол ${px(l0)} → ${px(l1)} буурсан. Сүүлийн оргил ${px(h1v)} эвдрээгүй цагт бүтэц уруудах.`, `Highs ${px(h0)} → ${px(h1v)} and lows ${px(l0)} → ${px(l1)} are falling. While the last high ${px(h1v)} holds, structure is down.`), levels);
  if (up) return make("structure", "structure", "H1", name, "SELL", t(`Өсөх бүтэцтэй байсан ч үнэ сүүлийн ёроол ${px(l1)}-ийг доош эвдсэн (CHoCH). Бүтэц эргэж байж магадгүй.`, `Structure was rising, but price broke the last low ${px(l1)} (CHoCH). It may be turning.`), levels);
  if (down) return make("structure", "structure", "H1", name, "BUY", t(`Унах бүтэцтэй байсан ч үнэ сүүлийн оргил ${px(h1v)}-ийг дээш эвдсэн (CHoCH). Бүтэц эргэж байж магадгүй.`, `Structure was falling, but price broke the last high ${px(h1v)} (CHoCH). It may be turning.`), levels);
  return make("structure", "structure", "H1", name, "NEUTRAL", t(`Оргил, ёроол нэг чиглэлд яваагүй (оргил ${px(h0)} → ${px(h1v)}, ёроол ${px(l0)} → ${px(l1)}). Хүрээн доторх хөдөлгөөн.`, `Highs and lows do not move together (highs ${px(h0)} → ${px(h1v)}, lows ${px(l0)} → ${px(l1)}). A range.`), levels);
};

/** The nearest fair value gap that has not been filled: a three-candle imbalance price tends to revisit. */
const fairValueGap: Read = ({ m15, price }, t) => {
  if (m15.length < 30) return null;
  const c = m15.slice(-96);
  const name = t("Fair Value Gap (FVG)", "Fair value gap (FVG)");
  for (let i = c.length - 1; i >= 2; i--) {
    const bull = c[i].low > c[i - 2].high, bear = c[i].high < c[i - 2].low;
    if (!bull && !bear) continue;
    const lo = bull ? c[i - 2].high : c[i].high, hi = bull ? c[i].low : c[i - 2].low;
    if (hi - lo < 0.5) continue; // too thin to matter on gold
    const after = c.slice(i + 1);
    const filled = bull ? after.some((x) => x.low <= lo) : after.some((x) => x.high >= hi);
    if (filled) continue;
    const levels = [{ label: t("FVG дээд", "FVG top"), price: hi }, { label: t("FVG доод", "FVG bottom"), price: lo }];
    if (bull && price >= lo) return make("fvg", "structure", "M15", name, "BUY", price <= hi
      ? t(`Үнэ дүүрээгүй өсөх FVG (${px(lo)} – ${px(hi)}) дотор байна. Энэ бүсийг эрэлтийн бүс гэж уншдаг.`, `Price is inside an unfilled bullish FVG (${px(lo)} – ${px(hi)}). It is read as a demand zone.`)
      : t(`Доор нь дүүрээгүй өсөх FVG (${px(lo)} – ${px(hi)}) үлдсэн. Тийш буцаж ирвэл дэмжлэг болно гэж уншдаг.`, `An unfilled bullish FVG (${px(lo)} – ${px(hi)}) sits below. A return to it is read as support.`), levels);
    if (bear && price <= hi) return make("fvg", "structure", "M15", name, "SELL", price >= lo
      ? t(`Үнэ дүүрээгүй унах FVG (${px(lo)} – ${px(hi)}) дотор байна. Энэ бүсийг нийлүүлэлтийн бүс гэж уншдаг.`, `Price is inside an unfilled bearish FVG (${px(lo)} – ${px(hi)}). It is read as a supply zone.`)
      : t(`Дээр нь дүүрээгүй унах FVG (${px(lo)} – ${px(hi)}) үлдсэн. Тийш буцаж ирвэл эсэргүүцэл болно гэж уншдаг.`, `An unfilled bearish FVG (${px(lo)} – ${px(hi)}) sits above. A return to it is read as resistance.`), levels);
    break; // the newest gap was run through from the wrong side: it no longer counts
  }
  return make("fvg", "structure", "M15", name, "NEUTRAL", t("Сүүлийн 24 цагт дүүрээгүй, хүчинтэй FVG алга.", "No valid unfilled FVG in the last 24 hours."));
};

/** A liquidity sweep: a wick through yesterday's high or low that closed back inside. */
const liquiditySweep: Read = ({ m15, d1, now }, t) => {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const prev = d1.filter((c) => c.time < dayStart).at(-1);
  if (!prev || m15.length < 16) return null;
  const name = t("Liquidity sweep (өчигдрийн оргил / ёроол)", "Liquidity sweep (yesterday's high / low)");
  const levels = [{ label: t("Өчигдрийн оргил", "Yesterday's high"), price: prev.high }, { label: t("Өчигдрийн ёроол", "Yesterday's low"), price: prev.low }];
  const recent = m15.slice(-16);
  const closeNow = last(recent).close;
  const sweptHigh = recent.find((c) => c.high > prev.high && c.close < prev.high);
  const sweptLow = recent.find((c) => c.low < prev.low && c.close > prev.low);
  if (sweptHigh && closeNow < prev.high) return make("sweep", "structure", "M15", name, "SELL", t(`Сүүлийн 4 цагт үнэ өчигдрийн оргил ${px(prev.high)}-ийг ${px(sweptHigh.high)} хүртэл хатгаад буцаж доор нь хаагдсан. Дээрх stop-уудыг шүүрдсэн гэж уншдаг.`, `In the last 4 hours price spiked through yesterday's high ${px(prev.high)} to ${px(sweptHigh.high)} and closed back under it. Read as the stops above being taken.`), levels);
  if (sweptLow && closeNow > prev.low) return make("sweep", "structure", "M15", name, "BUY", t(`Сүүлийн 4 цагт үнэ өчигдрийн ёроол ${px(prev.low)}-ийг ${px(sweptLow.low)} хүртэл хатгаад буцаж дээр нь хаагдсан. Доорх stop-уудыг шүүрдсэн гэж уншдаг.`, `In the last 4 hours price spiked through yesterday's low ${px(prev.low)} to ${px(sweptLow.low)} and closed back over it. Read as the stops below being taken.`), levels);
  return make("sweep", "structure", "M15", name, "NEUTRAL", t(`Сүүлийн 4 цагт өчигдрийн оргил ${px(prev.high)}, ёроол ${px(prev.low)}-ийн аль нь ч шүүрдэгдээгүй.`, `Neither yesterday's high ${px(prev.high)} nor its low ${px(prev.low)} was swept in the last 4 hours.`), levels);
};

/** Floor pivots from yesterday's candle: above the pivot leans up toward R1, below leans down toward S1. */
const pivotPoints: Read = ({ d1, price, now }, t) => {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const prev = d1.filter((c) => c.time < dayStart).at(-1);
  if (!prev) return null;
  const p = pivots(prev);
  const name = t("Pivot цэгүүд (өдрийн)", "Pivot points (daily)");
  const levels = [{ label: "R1", price: p.r1 }, { label: "Pivot", price: p.p }, { label: "S1", price: p.s1 }];
  const band = (prev.high - prev.low) * 0.03;
  if (Math.abs(price - p.p) <= band) return make("pivots", "levels", "D1", name, "NEUTRAL", t(`Үнэ pivot ${px(p.p)} дээр яг сууж байна. Аль тал руу гарахыг хүлээнэ.`, `Price is sitting right on the pivot ${px(p.p)}. It waits for a side.`), levels);
  return price > p.p
    ? make("pivots", "levels", "D1", name, "BUY", price >= p.r1
      ? t(`Үнэ R1 ${px(p.r1)}-ийг давсан. Дараагийн түвшин R2 ${px(p.r2)}.`, `Price is past R1 ${px(p.r1)}. The next level is R2 ${px(p.r2)}.`)
      : t(`Үнэ pivot ${px(p.p)}-оос дээш. Дээд зорилт R1 ${px(p.r1)} (${px(p.r1 - price)}$ зайтай).`, `Price is above the pivot ${px(p.p)}. The level above is R1 ${px(p.r1)} ($${px(p.r1 - price)} away).`), levels)
    : make("pivots", "levels", "D1", name, "SELL", price <= p.s1
      ? t(`Үнэ S1 ${px(p.s1)}-ийг давсан. Дараагийн түвшин S2 ${px(p.s2)}.`, `Price is past S1 ${px(p.s1)}. The next level is S2 ${px(p.s2)}.`)
      : t(`Үнэ pivot ${px(p.p)}-оос доош. Доод зорилт S1 ${px(p.s1)} (${px(price - p.s1)}$ зайтай).`, `Price is below the pivot ${px(p.p)}. The level below is S1 ${px(p.s1)} ($${px(price - p.s1)} away).`), levels);
};

/** Fibonacci retracement of the last 4-hour leg: a pullback into 38.2–61.8% in the leg's direction. */
const fibonacci: Read = ({ h4, price }, t) => {
  if (h4.length < 40) return null;
  const leg = h4.slice(-60);
  let hi = 0, lo = 0;
  leg.forEach((c, i) => { if (c.high > leg[hi].high) hi = i; if (c.low < leg[lo].low) lo = i; });
  const top = leg[hi].high, bottom = leg[lo].low, size = top - bottom;
  if (!(size > 0) || hi === lo) return null;
  const upLeg = lo < hi;
  const at = (r: number) => (upLeg ? top - size * r : bottom + size * r);
  const f382 = at(0.382), f618 = at(0.618);
  const zoneLo = Math.min(f382, f618), zoneHi = Math.max(f382, f618);
  const done = (upLeg ? (top - price) / size : (price - bottom) / size) * 100;
  const name = t("Fibonacci буцалт (38.2 – 61.8%)", "Fibonacci retracement (38.2 – 61.8%)");
  const levels = [{ label: "38.2%", price: f382 }, { label: "50%", price: at(0.5) }, { label: "61.8%", price: f618 }];
  if (price >= zoneLo && price <= zoneHi) return upLeg
    ? make("fibonacci", "levels", "H4", name, "BUY", t(`Өсөх хөл ${px(bottom)} → ${px(top)}-ийн ${done.toFixed(0)}%-ийг буцсан. Үнэ алтан бүс (${px(zoneLo)} – ${px(zoneHi)}) дотор, trend-ийн чиглэлд орох газар гэж уншдаг.`, `The up leg ${px(bottom)} → ${px(top)} has been retraced ${done.toFixed(0)}%. Price is in the golden zone (${px(zoneLo)} – ${px(zoneHi)}), read as a place to join the trend.`), levels)
    : make("fibonacci", "levels", "H4", name, "SELL", t(`Унах хөл ${px(top)} → ${px(bottom)}-ийн ${done.toFixed(0)}%-ийг буцсан. Үнэ алтан бүс (${px(zoneLo)} – ${px(zoneHi)}) дотор, trend-ийн чиглэлд орох газар гэж уншдаг.`, `The down leg ${px(top)} → ${px(bottom)} has been retraced ${done.toFixed(0)}%. Price is in the golden zone (${px(zoneLo)} – ${px(zoneHi)}), read as a place to join the trend.`), levels);
  return make("fibonacci", "levels", "H4", name, "NEUTRAL", done < 38.2
    ? t(`Сүүлийн хөл (${px(bottom)} – ${px(top)})-ийн ердөө ${Math.max(0, done).toFixed(0)}%-ийг буцсан. Алтан бүс ${px(zoneLo)} – ${px(zoneHi)} хүртэл ирээгүй.`, `Only ${Math.max(0, done).toFixed(0)}% of the last leg (${px(bottom)} – ${px(top)}) has been retraced. Price has not reached the golden zone ${px(zoneLo)} – ${px(zoneHi)}.`)
    : t(`Сүүлийн хөлийн ${Math.min(100, done).toFixed(0)}%-ийг буцсан: 61.8%-иас гүн. Хөл хүчээ алдсан гэж уншдаг.`, `${Math.min(100, done).toFixed(0)}% of the last leg has been retraced: deeper than 61.8%. The leg is read as having lost its force.`), levels);
};

/** Yesterday's high and low as support and resistance: outside them is a break, inside is a range. */
const previousDay: Read = ({ d1, price, now }, t) => {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const prev = d1.filter((c) => c.time < dayStart).at(-1);
  if (!prev) return null;
  const name = t("Өчигдрийн оргил / ёроол (дэмжлэг, эсэргүүцэл)", "Yesterday's high / low (support, resistance)");
  const levels = [{ label: t("Өчигдрийн оргил", "Yesterday's high"), price: prev.high }, { label: t("Өчигдрийн ёроол", "Yesterday's low"), price: prev.low }];
  if (price > prev.high) return make("prev-day", "levels", "D1", name, "BUY", t(`Үнэ өчигдрийн оргил ${px(prev.high)}-ийн дээр. Эсэргүүцэл дэмжлэг болж хувирсан гэж уншдаг.`, `Price is above yesterday's high ${px(prev.high)}. Resistance is read as having turned into support.`), levels);
  if (price < prev.low) return make("prev-day", "levels", "D1", name, "SELL", t(`Үнэ өчигдрийн ёроол ${px(prev.low)}-ийн доор. Дэмжлэг эсэргүүцэл болж хувирсан гэж уншдаг.`, `Price is below yesterday's low ${px(prev.low)}. Support is read as having turned into resistance.`), levels);
  return make("prev-day", "levels", "D1", name, "NEUTRAL", t(`Үнэ өчигдрийн хүрээн дотор (${px(prev.low)} – ${px(prev.high)}). Аль ч түвшин эвдрээгүй.`, `Price is inside yesterday's range (${px(prev.low)} – ${px(prev.high)}). Neither level is broken.`), levels);
};

const METHODS: Read[] = [emaStack, goldenCross, ichimoku, macd, rsiMomentum, rsiExtreme, bollinger, stochastic, donchian, asianRange, structure, fairValueGap, liquiditySweep, pivotPoints, fibonacci, previousDay];
export const FAMILIES: Family[] = ["trend", "momentum", "reversion", "breakout", "structure", "levels"];

const lean = (buy: number, sell: number, n: number): Verdict => {
  if (n === 0) return "NEUTRAL";
  const score = ((buy - sell) / n) * 100;
  return score >= LEAN ? "BUY" : score <= -LEAN ? "SELL" : "NEUTRAL";
};

/** Every method that has enough candles to speak, the count of which way they point, and the whole in one word. */
export function reason(input: ReasoningInput, t: T): Reasoning {
  const readings = METHODS.map((m) => m(input, t)).filter((r): r is Reading => r !== null);
  const count = (v: Verdict, rs = readings) => rs.filter((r) => r.verdict === v).length;
  const buy = count("BUY"), sell = count("SELL"), n = readings.length;
  const verdict = lean(buy, sell, n);
  const families = FAMILIES.map((family) => {
    const rs = readings.filter((r) => r.family === family);
    const b = count("BUY", rs), s = count("SELL", rs);
    return { family, name: familyName(family, t), verdict: lean(b, s, rs.length), buy: b, sell: s, n: rs.length };
  }).filter((f) => f.n > 0);

  // Reference levels sized by how much gold has been moving: not a tested rule, a ruler.
  const a = atr(input.h1);
  let plan: Plan | null = null;
  if (verdict !== "NEUTRAL" && !Number.isNaN(a) && a > 0) {
    const dir = verdict === "BUY" ? 1 : -1;
    const risk = PLAN_STOP_ATR * a;
    plan = { side: verdict, entry: input.price, stop: input.price - dir * risk, target: input.price + dir * risk * PLAN_RR, rr: PLAN_RR, atr: a };
  }
  return { price: input.price, readings, buy, sell, neutral: n - buy - sell, verdict, score: n ? Math.round(((buy - sell) / n) * 100) : 0, families, plan, atrH1: a };
}
