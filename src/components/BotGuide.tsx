import type { ReactNode } from "react";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";

/*
 * The two guides are prose with menu names and code woven through every sentence, so each
 * language has its own wording (…Mn and …En below) inside one shared layout.
 */
type Step = [string, ReactNode];
const CODE = "rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] text-zinc-100";

function Summary({ children }: { children: ReactNode }) {
  return <summary className="flex min-h-7 cursor-pointer items-center justify-between gap-3 text-[15px] font-semibold text-zinc-100">{children}<svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-500 transition-transform [details[open]_&]:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>;
}

/** The steps as stops along one line: numbered roundels joined by a 3px track. */
function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative mt-4 max-w-3xl">
      <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-[3px] rounded-full bg-zinc-800" />
      {steps.map(([title, body], i) => (
        <li key={title} className="relative flex gap-3 pb-4 text-sm last:pb-0">
          <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-zinc-700 bg-zinc-900 text-xs font-bold text-zinc-100 tabular-nums">{i + 1}</span>
          <div className="min-w-0 pt-0.5"><div className="font-semibold text-zinc-100">{title}</div><div className="mt-0.5 leading-relaxed text-zinc-300">{body}</div></div>
        </li>
      ))}
    </ol>
  );
}

type BotGuideProps = { origin: string; hasToken: boolean; online: boolean; v?: Viewer };

function botGuideMn({ origin, hasToken }: BotGuideProps) {
  const code = `${CODE} break-all`;
  const steps: Step[] = [
    ["MetaTrader 5-аа бэлдэх", <>Windows компьютер дээрээ MT5-г нээж, өөрийн дансаар нэвтэрнэ. Эхлээд заавал <strong>demo</strong> дансаар туршаарай.</>],
    ["Роботын файлыг татаж, MT5-д хуулах", <>
      <a className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/api/bot/download?file=ex5">XauBot.ex5 татах</a>. MT5 дээр <strong>File → Open Data Folder</strong> дарж, нээгдсэн хавтасны <span className={code}>MQL5</span> → <span className={code}>Experts</span> дотор файлыг хуулна. Дараа нь MT5-ийн зүүн талын <strong>Navigator</strong> (Ctrl+N) дотор <strong>Expert Advisors</strong> дээр баруун товч → <strong>Refresh</strong>. Жагсаалтад XauBot гарч ирнэ.
    </>],
    ["Вэбтэй холбогдохыг зөвшөөрөх", <>MT5 дээр <strong>Tools → Options → Expert Advisors</strong> таб. <strong>Allow WebRequest for listed URL</strong>-ийг чагталж, жагсаалтад энэ хаягийг нэмээд OK: <code className={code}>{origin}</code></>],
    ["Алтны чарт нээх", <><strong>Market Watch</strong> (Ctrl+M) дээр баруун товч → <strong>Symbols</strong> → <span className={code}>XAU</span> гэж хайж (зарим брокерт <span className={code}>GOLD</span>) → <strong>Show Symbol</strong> → OK. Дараа нь Market Watch дээрх XAUUSD дээр баруун товч → <strong>Chart Window</strong>.</>],
    ["Өөрийн токеноо үүсгэх", <>Энэ хуудасны доод талын <strong>“MT5 роботыг холбох”</strong> хэсэгт <strong>Токен үүсгэх</strong> дарж, гарсан урт кодыг хуулж авна. Токен нэг л удаа харагдана. Энэ нь таны MT5-г зөвхөн таны Бот хуудастай холбодог түлхүүр тул хэнд ч бүү өг.{hasToken ? " (Танд токен үүссэн байна.)" : ""}</>],
    ["Роботыг чарт дээр тавих", <>Navigator-оос <strong>XauBot</strong>-ыг алтны чарт руу чирнэ. Гарсан цонхны <strong>Inputs</strong> таб дээр <span className={code}>BotToken</span> мөрөнд токеноо буулгана. <span className={code}>ServerUrl</span> нь <code className={code}>{origin}/api/bot/sync</code> байх ёстой. <strong>Common</strong> таб дээр <strong>Allow Algo Trading</strong>-ийг чагтлаад OK.</>],
    ["Algo Trading асаах", <>MT5-ийн дээд самбарын <strong>Algo Trading</strong> товчийг дарж ногоон болгоно.</>],
    ["Шалгах", <>Чартын зүүн дээд буланд <span className={code}>вэб: холбогдсон</span> гэж гарна. Энэ хуудсан дээр <strong>MT5: холбогдсон</strong> болж, данс, үлдэгдэл чинь харагдана. Одоо тохиргоогоо хийгээд <strong>Start bot</strong> дарж болно.</>],
  ];
  return {
    summary: "Заавар: MT5-аа холбох, ботыг ашиглах",
    steps,
    useTitle: "Ашиглах",
    use: <>
        <li><strong>Хэрэгсэл</strong>: бот гурван хэрэгсэлтэй. <strong>Азийн breakout</strong> өдөрт нэг арилжаа хийдэг, tester дээр хоёр жилд шалгуур давсан цорын ганц дүрэм: Start дарсны дараа Stop дартал өдөр бүр ажиллана. <strong>Scalper</strong> нэг нэгээр орж арилжаа бүрийг өөрийн stop, target-аар хаана. <strong>Багц</strong> дохио гармагц олон арилжааг зэрэг нээж, нийт ашиг таны тавьсан $ дүнд хүрмэгц (эсвэл нийт алдагдал таны тавьсан хязгаарт хүрвэл) бүгдийг зэрэг хаана. Сонгоод хадгалсны дараа Start дарна.</li>
        <li><strong>Тохиргоо</strong>: арилжаа бүрийн лот, зэрэг нээх арилжааны тоо, stop/target-ийг өөрөө тавина. Лотын дээд хязгаар байхгүй тул хуудсан дээрх “алт $1 хөдлөхөд ±…” тооцоог харж сонгоорой.</li>
        <li><strong>Start bot</strong>: бот дохио гармагц өөрөө BUY эсвэл SELL орж, хэр удаан ажиллахаа өөрөө тооцоод, хугацаа дуусах, зорилтод хүрэх эсвэл чиглэл эргэхэд арилжаагаа хааж өөрөө зогсоно.</li>
        <li><strong>Stop</strong>: хүссэн үедээ дарж ботыг зогсооно. Нээлттэй арилжаанууд хаагдана. <strong>Бүгдийг хаах</strong> нь ботыг зогсоохгүйгээр арилжаануудыг хаана.</li>
        <li>Бот зөвхөн таны компьютер болон MT5 <strong>асаалттай</strong>, Algo Trading ногоон үед ажиллана. Холболт 30 секундээс удаан тасарвал шинээр арилжаа нээхгүй.</li>
        <li><strong>Жинхэнэ данс</strong> дээр ажиллуулахын тулд хоёр газар зөвшөөрнө: энэ хуудасны “Жинхэнэ данс” сонголт, мөн MT5 дээр роботын Inputs-ийн <span className={code}>AllowRealAccount = true</span>. Аль нэг нь унтраалттай бол бот жинхэнэ данс дээр арилжаа хийхгүй.</li>
        <li>Алтны зах бямба, ням гарагт хаалттай. Тэр үед Start дарсан ч арилжаа хийгдэхгүй.</li>
    </>,
    footer: <>Файл ажиллахгүй бол эх кодыг <a className="underline" href="/api/bot/download?file=mq5">XauBot.mq5</a> татаж, MetaEditor (F4) дээр нээгээд Compile (F7) дарж болно.</>,
  };
}

function botGuideEn({ origin, hasToken }: BotGuideProps): ReturnType<typeof botGuideMn> {
  const code = `${CODE} break-all`;
  const steps: Step[] = [
    ["Get MetaTrader 5 ready", <>Open MT5 on your Windows computer and sign in to your own account. Always try it on a <strong>demo</strong> account first.</>],
    ["Download the robot file and copy it into MT5", <>
      <a className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/api/bot/download?file=ex5">Download XauBot.ex5</a>. In MT5 click <strong>File → Open Data Folder</strong> and copy the file into <span className={code}>MQL5</span> → <span className={code}>Experts</span> in the folder that opens. Then, in the <strong>Navigator</strong> on the left of MT5 (Ctrl+N), right-click <strong>Expert Advisors</strong> → <strong>Refresh</strong>. XauBot appears in the list.
    </>],
    ["Allow it to reach the web", <>In MT5 open <strong>Tools → Options → Expert Advisors</strong>. Tick <strong>Allow WebRequest for listed URL</strong>, add this address to the list and press OK: <code className={code}>{origin}</code></>],
    ["Open a gold chart", <>Right-click in <strong>Market Watch</strong> (Ctrl+M) → <strong>Symbols</strong> → search for <span className={code}>XAU</span> (<span className={code}>GOLD</span> at some brokers) → <strong>Show Symbol</strong> → OK. Then right-click XAUUSD in Market Watch → <strong>Chart Window</strong>.</>],
    ["Create your own token", <>In the <strong>“Connect the MT5 robot”</strong> section at the bottom of this page press <strong>Create token</strong> and copy the long code it shows. The token is shown only once. It is the key that ties your MT5 to your Bot page alone, so give it to nobody.{hasToken ? " (You already have a token.)" : ""}</>],
    ["Put the robot on the chart", <>Drag <strong>XauBot</strong> from the Navigator onto the gold chart. In the window that opens, on the <strong>Inputs</strong> tab, paste your token into the <span className={code}>BotToken</span> row. <span className={code}>ServerUrl</span> must be <code className={code}>{origin}/api/bot/sync</code>. On the <strong>Common</strong> tab tick <strong>Allow Algo Trading</strong> and press OK.</>],
    ["Switch on Algo Trading", <>Press the <strong>Algo Trading</strong> button in MT5&apos;s top toolbar so that it turns green.</>],
    ["Check", <>The top-left corner of the chart shows <span className={code}>web: connected</span> (<span className={code}>вэб: холбогдсон</span> on an older robot file). This page shows <strong>MT5: connected</strong> along with your account and balance. Now set your settings and press <strong>Start bot</strong>.{/* i18n-ok: the older robot file's own wording is quoted */}</>],
  ];
  return {
    summary: "Guide: connect your MT5 and use the bot",
    steps,
    useTitle: "Using it",
    use: <>
        <li><strong>Tool</strong>: the bot has three tools. <strong>Asian breakout</strong> makes one trade a day and is the only rule that cleared the criteria over two years in the tester: after Start it runs every day until you press Stop. <strong>Scalper</strong> enters one trade at a time and closes each at its own stop or target. <strong>Basket</strong> opens many trades at once when a signal appears and closes them all together once total profit reaches the $ amount you set (or total loss reaches your limit). Choose one, save, then press Start.</li>
        <li><strong>Settings</strong>: you set the lots per trade, how many trades open at once and the stop/target yourself. There is no upper limit on lots, so choose with the “for every $1 gold moves ±…” figure on the page in view.</li>
        <li><strong>Start bot</strong>: when a signal appears the bot enters BUY or SELL by itself, works out how long to run, and closes its trades and stops by itself when the time runs out, the goal is reached or the direction reverses.</li>
        <li><strong>Stop</strong>: press it whenever you like to stop the bot. Open trades are closed. <strong>Close all</strong> closes the trades without stopping the bot.</li>
        <li>The bot works only while your computer and MT5 are <strong>on</strong> and Algo Trading is green. If the connection is lost for more than 30 seconds it opens no new trades.</li>
        <li>To run it on a <strong>real account</strong>, allow it in two places: the “Real account” option on this page, and <span className={code}>AllowRealAccount = true</span> in the robot&apos;s Inputs in MT5. If either is off, the bot does not trade on a real account.</li>
        <li>The gold market is closed on Saturday and Sunday. Pressing Start then places no trades.</li>
    </>,
    footer: <>If the file does not work, download the source <a className="underline" href="/api/bot/download?file=mq5">XauBot.mq5</a>, open it in MetaEditor (F4) and press Compile (F7).</>,
  };
}

/** Step-by-step: how a user connects their own MetaTrader 5 to their own bot page. */
export function BotGuide(props: BotGuideProps) {
  const c = (props.v ?? MN_VIEWER).locale === "en" ? botGuideEn(props) : botGuideMn(props);
  return (
    <details className="card" open={!props.online}>
      <Summary>{c.summary}</Summary>
      <Steps steps={c.steps} />
      <h3 className="mt-5 border-t border-zinc-800 pt-4 text-sm font-semibold text-zinc-100">{c.useTitle}</h3>
      <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">{c.use}</ul>
      <p className="mt-3 text-xs text-zinc-500">{c.footer}</p>
    </details>
  );
}

function backtestGuideMn({ ub, zone }: Viewer) {
  const code = CODE;
  const steps: Step[] = [
    ["Strategy Tester нээх", <>MT5 дээр <strong>View → Strategy Tester</strong> (Ctrl+R). Гарсан самбараас <strong>Single</strong> тестийг сонгоно.</>],
    ["Тохиргоо", <><strong>Expert</strong>: XauBot. <strong>Symbol</strong>: XAUUSD, <span className={code}>M1</span>. <strong>Date</strong>: Custom period, эхлээд сүүлийн 3 сар. <strong>Modelling</strong>: <span className={code}>Every tick based on real ticks</span>. <strong>Deposit</strong>: өөрийн ашиглах дүн (жишээ нь 1000 USD).</>],
    ["Роботын тохиргоо (Inputs таб)", <><span className={code}>TesterTool</span>: Scalper эсвэл Basket. <span className={code}>TesterLots</span>, <span className={code}>TesterCount</span> нь лот, арилжааны тоо. Scalper-т <span className={code}>TesterSlAtr</span>, <span className={code}>TesterTpAtr</span>. Багцад <span className={code}>TesterProfit</span>, <span className={code}>TesterLoss</span> хоёрыг заавал 0-ээс их тавина. Бусад мөрийг хөндөхгүй.</>],
    ["Start дарах", <>Анх удаа брокероос tick татах тул хэдэн минут болно. Тест дотор робот вэбтэй холбогдохгүй: нэг ажиллагаа дуусмагц <span className={code}>TesterRestartSeconds</span> секундийн дараа дахин Start дарсантай адил өөрөө эхэлнэ.</>],
    ["Үр дүнг унших", <><strong>Backtest</strong> таб дээр: <strong>Total Net Profit</strong> (нийт дүн), <strong>Profit Factor</strong> (ашиг ÷ алдагдал), <strong>Maximal Drawdown</strong> (хамгийн их уналт), <strong>Total Trades</strong>. <strong>Graph</strong> таб дээр дансны муруй харагдана.</>],
  ];
  return {
    summary: "Заавар: ботыг өнгөрсөн датан дээр шалгах (backtest)",
    intro: <>Жинхэнэ мөнгө тавихаас өмнө роботыг MT5-ийн Strategy Tester дээр брокерын бодит tick, spread-ээр тоглуулж үзнэ. Роботын v2.10 ба түүнээс шинэ файл хэрэгтэй.</>,
    steps,
    rulesTitle: "Урьдчилан тогтоосон дөрвөн дүрэм (v2.20)",
    rulesIntro: <>Scalper, Багц хоёр tester дээр алдагдалтай гарсан тул бүтцээрээ өөр дөрвөн дүрмийг үр дүн харахаас өмнө тогтоосон. Бүгд хаагдсан лаагаар шийднэ, өдөрт нэг арилжаа, тогтмол лот. Inputs дээрх <strong>Хэрэгсэл</strong> мөрөөс сонгоно.</>,
    rules: <>
        <li><strong>Азийн хүрээний breakout + өдрийн тренд.</strong> {ub("08:00")}–{ub("15:00")} ({zone}) цагийн хүрээнээс өдрийн трендийн чиглэлд гарч хаагдсан эхний 15 минутын лаа. Stop хүрээний дунд, target 2 дахин хол, {ub("04:00")}-д хаана.</li>
        <li><strong>Лондон нээлтийн эхний цагийн breakout.</strong> {ub("15:00")}–{ub("16:00")} ({zone}) цагийн хүрээнээс {ub("19:00")} хүртэл гарч хаагдсан эхний лаа, аль ч чиглэлд. Stop хүрээний нөгөө тал, target 1.5 дахин хол, {ub("23:00")}-д хаана.</li>
        <li><strong>Өдрийн тренд дагасан 1 цагийн буцалт.</strong> Тренд дээш, 1 цагийн лаа EMA20-д хүрч буцаад дээр нь хаагдсан, RSI 50-аас дээш бол BUY (доош трендэд эсрэгээр). Stop 1.5 ATR, target 3 ATR, 24 цагт хаана.</li>
        <li><strong>Хэт холдсон үнийн эсрэг.</strong> Үнэ 1 цагийн EMA20-оос 2 ATR-аас хол, RSI 25-аас доош бол BUY (75-аас дээш бол SELL). Stop 1.5 ATR, target EMA20 руу буцах зай, 12 цагт хаана.</li>
    </>,
    twoYears: <>Эдгээр нь өдөрт нэг л арилжаа хийдэг тул 3 сар хангалтгүй. Дүрэм бүрийг <strong>хоёр тусдаа жилд</strong> гүйлгэнэ: <span className={code}>2024.11.20 – 2025.11.20</span> ба <span className={code}>2025.11.20 – 2026.11.20</span>. Хоёр жилд хоёуланд нь Profit Factor 1.2-оос дээш, жил бүр 100-аас олон арилжаатай гарсан дүрэм л ботод үлдэнэ.</>,
    goodTitle: "Юуг сайн үр дүн гэх вэ",
    good: <>
        <li>Scalper, Багцад дор хаяж 200 арилжаа; өдөрт нэг арилжаа хийдэг дүрэмд жилд дор хаяж 100. Цөөн арилжааны үр дүн тохиолдлынх байж болно.</li>
        <li>Profit Factor 1.2-оос дээш, Maximal Drawdown таны тэвчих хэмжээнд.</li>
        <li>Өөр хоёр хугацаанд (жишээ нь сүүлийн 3 сар, түүний өмнөх 3 сар) хоёуланд нь ашигтай гарах. Нэгд нь л сайн бол найдваргүй.</li>
        <li>Тохиргоог үр дүн сайхан болтол олон дахин өөрчилж болохгүй: тэгвэл өнгөрсөнд тааруулсан болохоос ирээдүйд ажиллах баталгаа болохгүй. Нэг хугацаан дээр тохируулаад, огт хөндөөгүй өөр хугацаан дээр шалгана.</li>
        <li>Тест сайн гарсан ч жинхэнэ данс руу шууд биш, эхлээд demo дээр хэд хоног ажиллуулна.</li>
    </>,
  };
}

function backtestGuideEn({ ub, zone }: Viewer): ReturnType<typeof backtestGuideMn> {
  const code = CODE;
  const steps: Step[] = [
    ["Open the Strategy Tester", <>In MT5: <strong>View → Strategy Tester</strong> (Ctrl+R). In the panel that opens choose the <strong>Single</strong> test.</>],
    ["Settings", <><strong>Expert</strong>: XauBot. <strong>Symbol</strong>: XAUUSD, <span className={code}>M1</span>. <strong>Date</strong>: Custom period, the last 3 months to begin with. <strong>Modelling</strong>: <span className={code}>Every tick based on real ticks</span>. <strong>Deposit</strong>: the amount you would use (for example 1000 USD).</>],
    ["Robot settings (Inputs tab)", <><span className={code}>TesterTool</span>: Scalper or Basket. <span className={code}>TesterLots</span> and <span className={code}>TesterCount</span> are the lots and the number of trades. For the Scalper, <span className={code}>TesterSlAtr</span> and <span className={code}>TesterTpAtr</span>. For the Basket, both <span className={code}>TesterProfit</span> and <span className={code}>TesterLoss</span> must be above 0. Leave the other rows alone.</>],
    ["Press Start", <>The first time, it downloads ticks from the broker, which takes a few minutes. Inside a test the robot does not connect to the web: when one run ends it starts again by itself after <span className={code}>TesterRestartSeconds</span> seconds, as if you had pressed Start.</>],
    ["Read the result", <>On the <strong>Backtest</strong> tab: <strong>Total Net Profit</strong> (the overall result), <strong>Profit Factor</strong> (profit ÷ loss), <strong>Maximal Drawdown</strong> (the deepest fall) and <strong>Total Trades</strong>. The <strong>Graph</strong> tab shows the account curve.</>],
  ];
  return {
    summary: "Guide: test the bot on past data (backtest)",
    intro: <>Before putting real money on it, replay the robot in MT5&apos;s Strategy Tester on the broker&apos;s real ticks and spread. You need robot file v2.10 or newer.</>,
    steps,
    rulesTitle: "Four rules set in advance (v2.20)",
    rulesIntro: <>The Scalper and the Basket both lost money in the tester, so four structurally different rules were fixed before any result was seen. All of them decide on closed candles, make one trade a day and use a fixed lot size. Choose one on the <strong>Tool</strong> row of the Inputs.</>,
    rules: <>
        <li><strong>Asian range breakout + daily trend.</strong> The first 15-minute candle that closes outside the {ub("08:00")}–{ub("15:00")} ({zone}) range in the direction of the daily trend. Stop at the middle of the range, target twice as far, closed at {ub("04:00")}.</li>
        <li><strong>London open first-hour breakout.</strong> The first candle that closes outside the {ub("15:00")}–{ub("16:00")} ({zone}) range before {ub("19:00")}, in either direction. Stop at the other side of the range, target 1.5 times as far, closed at {ub("23:00")}.</li>
        <li><strong>1-hour pullback with the daily trend.</strong> Trend up, a 1-hour candle touches EMA20 and closes back above it, RSI above 50: BUY (the reverse in a down trend). Stop 1.5 ATR, target 3 ATR, closed after 24 hours.</li>
        <li><strong>Fading an overstretched price.</strong> Price more than 2 ATR from the 1-hour EMA20 and RSI below 25: BUY (above 75: SELL). Stop 1.5 ATR, target the distance back to EMA20, closed after 12 hours.</li>
    </>,
    twoYears: <>These make only one trade a day, so 3 months is not enough. Run each rule over <strong>two separate years</strong>: <span className={code}>2024.11.20 – 2025.11.20</span> and <span className={code}>2025.11.20 – 2026.11.20</span>. Only a rule with a Profit Factor above 1.2 in both years and more than 100 trades in each stays in the bot.</>,
    goodTitle: "What counts as a good result",
    good: <>
        <li>At least 200 trades for the Scalper and the Basket; at least 100 a year for a rule that trades once a day. A result from few trades can be chance.</li>
        <li>Profit Factor above 1.2, and a Maximal Drawdown you could live with.</li>
        <li>Profitable in two different periods (for example the last 3 months and the 3 months before). Good in only one of them is not reliable.</li>
        <li>Do not keep changing the settings until the result looks good: that fits them to the past and is no guarantee for the future. Tune on one period, then check on another you have not touched.</li>
        <li>Even after a good test, do not go straight to a real account: run it on demo for some days first.</li>
    </>,
  };
}

/** How to replay the robot over past ticks in MetaTrader's own Strategy Tester. */
export function BacktestGuide({ v = MN_VIEWER }: { v?: Viewer }) {
  const c = v.locale === "en" ? backtestGuideEn(v) : backtestGuideMn(v);
  return (
    <details className="card">
      <Summary>{c.summary}</Summary>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300">{c.intro}</p>
      <Steps steps={c.steps} />
      <h3 className="mt-5 border-t border-zinc-800 pt-4 text-sm font-semibold text-zinc-100">{c.rulesTitle}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">{c.rulesIntro}</p>
      <ol className="mt-2 max-w-3xl list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">{c.rules}</ol>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">{c.twoYears}</p>
      <h3 className="mt-5 border-t border-zinc-800 pt-4 text-sm font-semibold text-zinc-100">{c.goodTitle}</h3>
      <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">{c.good}</ul>
    </details>
  );
}
