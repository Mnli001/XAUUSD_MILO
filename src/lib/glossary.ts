import type { T } from "./i18n";

/**
 * Plain-language explanations of the words the site uses, for someone who is new to trading.
 * Each entry is written once per language. The ids are the anchors on /glossary (e.g. /glossary#atr).
 */
type Text = { mn: string; en: string };
type Entry = { id: string; term: Text; def: Text };

const ENTRIES = [
  // The basics
  { id: "buy-sell", term: { mn: "BUY / SELL", en: "BUY / SELL" }, def: { mn: "BUY гэдэг нь үнэ өснө гэж үзээд авах арилжаа, SELL нь үнэ буурна гэж үзээд зарах арилжаа. Алтыг аль ч чиглэлд арилжиж болно.", en: "BUY is a trade that profits if the price rises; SELL is a trade that profits if it falls. Gold can be traded either way." } },
  { id: "candle", term: { mn: "Лаа (candle)", en: "Candle" }, def: { mn: "Тодорхой хугацаанд (жишээ нь 15 минут) үнэ хаанаас эхэлж, хаана хаагдаж, хамгийн өндөр, хамгийн нам хаана хүрснийг харуулсан нэг дүрс. Ногоон нь өссөн, улаан нь буурсан.", en: "One bar showing where the price opened and closed, and its high and low, over a set time (for example 15 minutes). Green rose, red fell." } },
  { id: "timeframe", term: { mn: "Цагийн хүрээ", en: "Timeframe" }, def: { mn: "Нэг лаа хэдий хугацааг хамрахыг заана: 15м = 15 минут, 1ц = 1 цаг, 4ц = 4 цаг, Өдөр = 1 өдөр. Урт хүрээ ерөнхий чиглэлийг, богино хүрээ орох цэгийг харуулна.", en: "How much time one candle covers: 15m, 1h, 4h, 1 day. Longer frames show the overall direction, shorter ones the entry." } },
  { id: "trend", term: { mn: "Тренд", en: "Trend" }, def: { mn: "Үнийн ерөнхий чиглэл. Оргил, ёроол нь улам өндөрсөж байвал өсөх тренд, улам намсаж байвал буурах тренд.", en: "The price's overall direction. Higher highs and higher lows make an uptrend; lower highs and lower lows a downtrend." } },
  { id: "session", term: { mn: "Сешн (Ази, Лондон, Нью-Йорк)", en: "Session (Asia, London, New York)" }, def: { mn: "Дэлхийн гол санхүүгийн төвүүдийн арилжааны цаг. Алт ихэвчлэн Лондон, Нью-Йоркийн цагт хамгийн хүчтэй хөдөлдөг. Сайт бүх цагийг таны сонгосон цагийн бүсээр харуулна.", en: "The trading hours of the world's main financial centres. Gold usually moves most in the London and New York hours. The site shows every time in your chosen time zone." } },
  { id: "spread", term: { mn: "Спрэд", en: "Spread" }, def: { mn: "Авах ба зарах үнийн зөрүү. Арилжаа нээх бүрт төлдөг далд зардал; мэдээний үед өргөсдөг.", en: "The gap between the buy and the sell price. A hidden cost paid on every trade; it widens around news." } },
  { id: "lot", term: { mn: "Лот", en: "Lot" }, def: { mn: "Арилжааны хэмжээ. Алтанд 1 лот = 100 унц, тиймээс алтны үнэ $1 хөдлөхөд 1 лот $100, 0.01 лот $1 ашиг эсвэл алдагдал өгнө. Шинээр эхэлж байгаа бол хамгийн бага лотоор эхэл.", en: "Trade size. In gold 1 lot = 100 ounces, so a $1 move in gold is $100 on 1 lot and $1 on 0.01 lot. If you are new, start with the smallest lot." } },
  { id: "stop-loss", term: { mn: "Stop loss", en: "Stop loss" }, def: { mn: "Алдагдлыг хязгаарлах үнэ. Үнэ тэнд хүрвэл арилжаа автоматаар хаагдана. Арилжаа бүрт stop тавьж байж эрсдэлээ мэдэнэ.", en: "The price that limits a loss: when it is reached the trade closes on its own. Setting one on every trade is how you know your risk." } },
  { id: "take-profit", term: { mn: "Target (take profit)", en: "Target (take profit)" }, def: { mn: "Ашиг авах үнэ. Үнэ тэнд хүрвэл арилжаа ашигтай хаагдана.", en: "The price where profit is taken: when it is reached the trade closes in profit." } },
  { id: "r", term: { mn: "R", en: "R" }, def: { mn: "Нэг арилжаанд эрсдэлд оруулсан дүн: орох үнээс stop хүртэлх зай. +2R гэвэл эрсдэлийнхээ 2 дахинтай тэнцэх ашиг, −1R гэвэл stop-доо хүрсэн бүтэн алдагдал. Дундаж R эерэг байвал арга урт хугацаандаа ашигтай байсан.", en: "The amount risked on one trade: the distance from entry to the stop. +2R is a profit twice the risk, −1R a full loss at the stop. A positive average R means the method made money over time." } },
  { id: "rr", term: { mn: "R:R (эрсдэл : ашиг)", en: "R:R (risk : reward)" }, def: { mn: "Эрсдэлд оруулах дүн ба хүлээж буй ашгийн харьцаа. 1 : 2 гэвэл $10 эрсдэлд $20 ашиг хүлээнэ. 1-ээс бага бол ашигтай гарахын тулд хожих хувь өндөр байх ёстой.", en: "The amount risked against the profit aimed for. 1 : 2 means risking $10 to make $20. Below 1, the win rate has to be high to come out ahead." } },
  { id: "demo", term: { mn: "Demo данс", en: "Demo account" }, def: { mn: "Жинхэнэ мөнгөгүй туршилтын данс. Бот, setup, лотын хэмжээг эхлээд энд туршиж, дадсаны дараа жинхэнэ данс руу шилжинэ.", en: "A practice account with no real money. Try the bot, the setups and your lot size here first, and move to a real account once you are used to them." } },
  { id: "mt5", term: { mn: "MetaTrader 5 (MT5)", en: "MetaTrader 5 (MT5)" }, def: { mn: "Брокерийн арилжааны програм (компьютер, утсанд). Сайтын бот MT5 дотор ажиллаж, таны дансанд арилжаа хийнэ.", en: "The broker's trading app (computer and phone). The site's bot runs inside MT5 and trades in your account." } },
  // Indicators and levels
  { id: "bias", term: { mn: "Давамгай тал", en: "Leading side" }, def: { mn: "Олон цагийн хүрээний трендийг нэгтгээд авагч эсвэл худалдагч аль нь давуу байгааг оноогоор харуулна. Энэ нь чиглэлийн сэжүүр, баталгаа биш.", en: "Combines the trend on several timeframes into a score showing whether buyers or sellers have the upper hand. A lean, not a promise." } },
  { id: "ema", term: { mn: "EMA (20 / 50 / 200)", en: "EMA (20 / 50 / 200)" }, def: { mn: "Сүүлийн 20, 50, 200 лааны дундаж үнийг шинэ үнэд илүү жин өгч зурсан шугам. Үнэ шугамаас дээр байвал ихэвчлэн өсөх тренд, доор байвал буурах тренд.", en: "A line through the average price of the last 20, 50 or 200 candles, weighting recent prices more. Price above it usually means an uptrend, below it a downtrend." } },
  { id: "rsi", term: { mn: "RSI", en: "RSI" }, def: { mn: "Үнийн хурдыг 0–100-аар хэмждэг индикатор. 70-аас дээш бол хэт хурдан өссөн (overbought), 30-аас доош бол хэт хурдан унасан (oversold) гэж үздэг.", en: "Measures the speed of price moves from 0 to 100. Above 70 is read as overbought (risen too fast), below 30 as oversold." } },
  { id: "macd", term: { mn: "MACD", en: "MACD" }, def: { mn: "Хоёр EMA-ийн зөрүүгээр үнийн хурдлалт (моментум) нэмэгдэж эсвэл сулрахыг харуулдаг индикатор.", en: "Shows whether momentum is building or fading, from the gap between two EMAs." } },
  { id: "stochastic", term: { mn: "Stochastic", en: "Stochastic" }, def: { mn: "Сүүлийн хэдэн лааны хүрээнд одоогийн үнэ хаана байгааг 0–100-аар хэмжинэ. 80-аас дээш бол хүрээний оргилд, 20-оос доош бол ёроолд ойр.", en: "Where the price sits within the range of the last few candles, from 0 to 100. Above 80 is near the top of the range, below 20 near the bottom." } },
  { id: "bollinger", term: { mn: "Bollinger bands", en: "Bollinger bands" }, def: { mn: "Дундаж шугамын дээр, доор үнийн хэлбэлзлээр тооцсон хоёр зурвас. Үнэ зурвасны ирмэгт хүрэх нь хэт хол явсныг илтгэж болно; зурвас нарийсах нь тайван үе.", en: "Two bands set above and below an average by how much the price swings. Touching a band can mean the price has run far; narrow bands mean a quiet market." } },
  { id: "ichimoku", term: { mn: "Ichimoku", en: "Ichimoku" }, def: { mn: "Тренд, дэмжлэг, эсэргүүцлийг “үүл” болон хэд хэдэн шугамаар нэг дор харуулдаг Япон индикатор. Үнэ үүлнээс дээр бол өсөх, доор бол буурах тал руу.", en: "A Japanese indicator that shows trend, support and resistance at once with a “cloud” and several lines. Price above the cloud leans up, below it leans down." } },
  { id: "donchian", term: { mn: "Donchian суваг", en: "Donchian channel" }, def: { mn: "Сүүлийн хэдэн лааны хамгийн өндөр, хамгийн нам үнээр зурсан суваг. Үнэ сувгаас гарч хаагдвал breakout гэж үзнэ.", en: "A channel drawn through the highest high and lowest low of the last few candles. A close outside it counts as a breakout." } },
  { id: "fibonacci", term: { mn: "Fibonacci", en: "Fibonacci" }, def: { mn: "Сүүлийн хөдөлгөөний 38.2%, 50%, 61.8% зэрэг хувиар тооцсон түвшин. Хөдөлгөөний дараа үнэ эдгээр түвшин хүртэл буцаж ирээд дахин үргэлжлэх нь элбэг.", en: "Levels at 38.2%, 50%, 61.8% and similar fractions of the last move. After a move, price often pulls back to one of them before carrying on." } },
  { id: "atr", term: { mn: "ATR", en: "ATR" }, def: { mn: "Average True Range: нэг лааны дундаж хөдөлгөөн доллараар. Зах зээл хэр хүчтэй хөдөлж байгааг харуулна; stop-ийн зайг ATR-аар тооцвол тайван, хүчтэй өдрийн аль алинд тохирно.", en: "Average True Range: how far one candle moves on average, in dollars. It shows how lively the market is; a stop sized by ATR fits both quiet and wild days." } },
  { id: "pivot", term: { mn: "Pivot, R1, R2, S1, S2", en: "Pivot, R1, R2, S1, S2" }, def: { mn: "Өчигдрийн оргил, ёроол, хаалтаас тооцсон өнөөдрийн түвшнүүд. R (эсэргүүцэл) нь үнэ өсөхдөө зогсож болох дээд түвшин, S (дэмжлэг) нь унахдаа зогсож болох доод түвшин, Pivot нь дунд нь.", en: "Today's levels worked out from yesterday's high, low and close. R (resistance) is where a rise may stall, S (support) where a fall may stall, and the pivot sits between." } },
  { id: "momentum", term: { mn: "Моментум", en: "Momentum" }, def: { mn: "Үнэ нэг чиглэлд хэр хурдан, хэр хүчтэй хөдөлж байгаа. Моментум сулрах нь хөдөлгөөн дуусч болзошгүйн шинж.", en: "How fast and how strongly the price is moving one way. Fading momentum can be a sign the move is ending." } },
  { id: "breakout", term: { mn: "Breakout", en: "Breakout" }, def: { mn: "Үнэ тодорхой хүрээ эсвэл түвшнээс гарч хаагдах. Жинхэнэ breakout-ийн дараа үнэ тэр чиглэлдээ үргэлжлэх хандлагатай, хуурамч нь буцаад хүрээ рүүгээ ордог.", en: "The price closing outside a range or level. A real breakout tends to carry on; a false one falls back into the range." } },
  // Structure
  { id: "ict-smc", term: { mn: "ICT / SMC (бүтэц)", en: "ICT / SMC (structure)" }, def: { mn: "Томоохон оролцогчид (банк, сан) хаана захиалга хийдгийг оргил, ёроол, liquidity-ээр уншдаг арга барил. Бүтэц эвдрэх (MSS, BOS) нь чиглэл өөрчлөгдөж болзошгүйн дохио.", en: "A way of reading where large players (banks, funds) place orders, using highs, lows and liquidity. A break in structure (MSS, BOS) hints that the direction may be changing." } },
  { id: "liquidity", term: { mn: "Liquidity, sweep (BSL / SSL)", en: "Liquidity, sweep (BSL / SSL)" }, def: { mn: "Олон хүний stop захиалга хуримтлагдсан оргил (BSL) эсвэл ёроол (SSL). Sweep гэдэг нь үнэ тэр түвшнийг богино хугацаанд давж stop-уудыг идээд буцах явдал.", en: "Highs (BSL) and lows (SSL) where many traders' stops collect. A sweep is when the price briefly runs past such a level, takes those stops, and turns back." } },
  { id: "fvg", term: { mn: "FVG (fair value gap)", en: "FVG (fair value gap)" }, def: { mn: "Хүчтэй, хурдан хөдөлгөөний дараа гурван лааны дунд үлдсэн бараг арилжаагүй үнийн зай. Үнэ буцаж ирж тэр зайг дүүргэх нь элбэг тул орох бүс болгон хардаг.", en: "A gap left inside three candles after a fast, strong move, where little traded. Price often comes back to fill it, so it is watched as an entry zone." } },
  // News
  { id: "news", term: { mn: "NFP, CPI, FOMC", en: "NFP, CPI, FOMC" }, def: { mn: "АНУ-ын ажлын байрны тоо (NFP), инфляц (CPI), Холбооны нөөцийн хүүгийн шийдвэр (FOMC). Эдгээр гарах үед алт хэдхэн минутад хүчтэй хөдөлж, спрэд өргөсөж болно.", en: "US jobs (NFP), inflation (CPI) and the Federal Reserve's rate decision (FOMC). When they come out, gold can move hard within minutes and spreads can widen." } },
  // Reading results
  { id: "pnl", term: { mn: "P&L", en: "P&L" }, def: { mn: "Profit and Loss: арилжааны ашиг ба алдагдлын нийлбэр.", en: "Profit and loss: what the trades made or lost, added up." } },
  { id: "win-rate", term: { mn: "Win rate", en: "Win rate" }, def: { mn: "Ашигтай хаагдсан арилжааны хувь. Ганцаараа хангалтгүй: олон жижиг ашиг, цөөн том алдагдал байвал хожих хувь өндөр ч мөнгө алдана. Дундаж R, profit factor-той хамт хар.", en: "The share of trades closed in profit. Not enough on its own: many small wins and a few big losses can still lose money. Read it with average R and profit factor." } },
  { id: "profit-factor", term: { mn: "Profit factor", en: "Profit factor" }, def: { mn: "Нийт ашгийг нийт алдагдалд хуваасан харьцаа. 1-ээс дээш бол ашигтай: 1.5 гэвэл алдсан $1 тутамд $1.50 олсон. 1-ээс доош бол алдагдалтай.", en: "Total profit divided by total loss. Above 1 is profitable: 1.5 means $1.50 made for every $1 lost. Below 1 is a loss." } },
  { id: "drawdown", term: { mn: "Drawdown", en: "Drawdown" }, def: { mn: "Дансны өмнөх оргилоос хамгийн их унасан дүн. Хамгийн муу үед хэр их алдсаныг, тэрийг тэсвэрлэж чадах эсэхээ харуулна.", en: "The largest drop from a previous peak of the account. It shows how much was lost in the worst stretch, and whether you could sit through it." } },
  { id: "sample", term: { mn: "Түүврийн тоо (n)", en: "Sample size (n)" }, def: { mn: "Хувийг хэдэн өдөр эсвэл арилжаан дээр тооцсон тоо. Тоо бага бол хувь санамсаргүй байж болно; 30-аас цөөн бол сайт хувь харуулахгүй.", en: "How many days or trades a percentage is based on. A small count can be chance; under 30 the site shows no percentage." } },
] as const satisfies readonly Entry[];

export type GlossaryId = (typeof ENTRIES)[number]["id"];
export const GLOSSARY: readonly Entry[] = ENTRIES;

export function glossaryEntry(id: GlossaryId): Entry {
  return GLOSSARY.find((e) => e.id === id) as Entry;
}

/** How the glossary page groups the entries, from first steps to reading results. */
export const GLOSSARY_GROUPS: readonly { id: string; title: Text; ids: readonly GlossaryId[] }[] = [
  { id: "basics", title: { mn: "Үндсэн ойлголт", en: "The basics" }, ids: ["buy-sell", "candle", "timeframe", "trend", "session", "spread", "lot", "stop-loss", "take-profit", "r", "rr", "demo", "mt5"] },
  { id: "indicators", title: { mn: "Индикатор ба түвшин", en: "Indicators and levels" }, ids: ["bias", "ema", "rsi", "macd", "stochastic", "bollinger", "ichimoku", "donchian", "fibonacci", "atr", "pivot", "momentum", "breakout"] },
  { id: "structure", title: { mn: "Бүтэц (ICT / SMC)", en: "Structure (ICT / SMC)" }, ids: ["ict-smc", "liquidity", "fvg"] },
  { id: "news", title: { mn: "Мэдээ", en: "News" }, ids: ["news"] },
  { id: "results", title: { mn: "Үр дүнг унших", en: "Reading results" }, ids: ["pnl", "win-rate", "profit-factor", "drawdown", "sample"] },
];

/** Profit factor in plain money terms, for the Performance figures. */
export function profitFactorNote(pf: number | null, t: T): string {
  if (pf === null) return t("Алдагдалтай арилжаа гараагүй тул тооцогдоогүй", "Not shown until there is a losing trade");
  const x = pf.toFixed(2);
  return pf < 1
    ? t(`Алдсан $1 тутамд $${x} олсон: нийтдээ алдагдалтай`, `$${x} made for every $1 lost: a net loss overall`)
    : t(`Алдсан $1 тутамд $${x} олсон`, `$${x} made for every $1 lost`);
}
