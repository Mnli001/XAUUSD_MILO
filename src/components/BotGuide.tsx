import type { ReactNode } from "react";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { recordSentence, testWindows, type BrokerRecord } from "@/lib/siteCopy";
import { mnT, enT } from "@/lib/i18n";

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

/** `record`: the one dated research result (BROKER_RECORD in lib/setup/build), shown the same as on the Setup page. */
type BotGuideProps = { origin: string; hasToken: boolean; online: boolean; v?: Viewer; record?: BrokerRecord | null };

function botGuideMn({ origin, hasToken, record }: BotGuideProps) {
  const code = `${CODE} break-all`;
  const steps: Step[] = [
    ["MetaTrader 5-аа бэлдэх", <>Windows компьютер эсвэл VPS дээрээ MT5-г нээж, өөрийн дансаар нэвтэрнэ. Бот MT5 асаалттай байх хугацаанд л ажилладаг. Эхлээд заавал <strong>demo</strong> дансаар туршаарай.</>],
    ["Роботын файлыг татаж, MT5-д хуулах", <>
      <a className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/api/bot/download?file=ex5">XauBot.ex5 татах</a>. MT5 дээр <strong>File → Open Data Folder</strong> дарж, нээгдсэн хавтасны <span className={code}>MQL5</span> → <span className={code}>Experts</span> дотор файлыг хуулна. Дараа нь MT5-ийн зүүн талын <strong>Navigator</strong> (Ctrl+N) дотор <strong>Expert Advisors</strong> дээр баруун товч → <strong>Refresh</strong>. Жагсаалтад XauBot гарч ирнэ.
    </>],
    ["Вэбтэй холбогдохыг зөвшөөрөх", <>MT5 дээр <strong>Tools → Options → Expert Advisors</strong> таб. <strong>Allow WebRequest for listed URL</strong>-ийг чагталж, жагсаалтад энэ хаягийг нэмээд OK: <code className={code}>{origin}</code></>],
    ["Алтны чарт нээх", <><strong>Market Watch</strong> (Ctrl+M) дээр баруун товч → <strong>Symbols</strong> → <span className={code}>XAU</span> гэж хайж (зарим брокерт <span className={code}>GOLD</span>) → <strong>Show Symbol</strong> → OK. Дараа нь Market Watch дээрх XAUUSD дээр баруун товч → <strong>Chart Window</strong>.</>],
    ["Өөрийн токеноо үүсгэх", <>Энэ хуудасны доод талын <strong>“MT5 роботыг холбох”</strong> хэсэгт <strong>Токен үүсгэх</strong> дарж, гарсан урт кодыг хуулж авна. Токен нэг л удаа харагдана. Энэ нь таны MT5-г зөвхөн таны Бот хуудастай холбодог түлхүүр тул хэнд ч бүү өг.{hasToken ? " (Танд токен үүссэн байна.)" : ""}</>],
    ["Роботыг чарт дээр тавих", <>Navigator-оос <strong>XauBot</strong>-ыг алтны чарт руу чирнэ. Гарсан цонхны <strong>Inputs</strong> таб дээр <span className={code}>BotToken</span> мөрөнд токеноо буулгана. <span className={code}>ServerUrl</span> нь <code className={code}>{origin}/api/bot/sync</code> байх ёстой. <strong>Common</strong> таб дээр <strong>Allow Algo Trading</strong>-ийг чагтлаад OK.</>],
    ["Algo Trading асаах", <>MT5-ийн дээд самбарын <strong>Algo Trading</strong> товчийг дарж ногоон болгоно.</>],
    ["Шалгах", <>Чартын зүүн дээд буланд <span className={code}>вэб: холбогдсон</span> гэж гарна. Энэ хуудсан дээр <strong>MT5: холбогдсон</strong> болж, данс, үлдэгдэл чинь харагдана. Одоо хэрэгслээ сонгож хадгалаад <strong>Ботыг эхлүүлэх</strong> дарна.</>],
  ];
  return {
    summary: "Заавар: MT5-аа холбох, ботыг ашиглах",
    steps,
    useTitle: "Ашиглах",
    use: <>
        <li><strong>Хэрэгсэл</strong>: бот дөрвөн хэрэгсэлтэй. <strong>Setup дохио</strong> нь Setup хуудасны 3 setup-ийг (Ази, Нью-Йоркийн 2 нээлт) яг тэр дүрмээр арилжаална: setup бүр өдөрт нэг, нийт өдөрт 3 хүртэл арилжаа. <strong>Өдрийн арилжаа (Day trader)</strong> 15 минутын чарт дээр sweep → MSS → FVG хэв маяг бүрдэж, сайтын дүгнэлт ижил чиглэл заахад орно. <strong>Дүгнэлт</strong> сайтын олон аргын дүгнэлтийг шууд дагана. <strong>Багц</strong> бол туршилтын хэрэгсэл: дохио гармагц олон арилжааг зэрэг нээж, нийт ашиг эсвэл нийт алдагдал таны тавьсан дүнд хүрэхэд бүгдийг зэрэг хаана; түүний үр дүнгийн талаар баталгаа өгөхгүй. Сонгоод хадгалсны дараа эхлүүлнэ.</li>
        {record && <li><strong>Судалгааны үр дүн</strong>: {recordSentence(record, mnT)}</li>}
        <li><strong>Тохиргоо</strong>: арилжаа бүрийн лотыг өөрөө тавина; Багцад арилжааны тоо, хаах ашиг ба алдагдлын дүнг мөн. Лотын дээд хязгаар байхгүй тул хуудсан дээрх “алт $1 хөдлөхөд ±…” тооцоог харж сонгоорой.</li>
        <li><strong>Орох шүүлтүүр</strong>: Day trader, Дүгнэлт, Багц арилжаа нээхээс өмнө шалгалт давна: H1 ба M15 тренд таарах, арилжааны цаг, HIGH мэдээний өмнө/дараа биш, хэлбэлзэл (ATR) хэт бага ч, хэт их ч биш, spread нарийн, RSI хэт сунаагүй, үнэ EMA20-оос хэт холдоогүй, өдрийн орох тоо болон өдрийн алдагдлын хязгаар. Setup дохио Setup хуудасны дүрмийг л дагана. Бот яагаад орохгүй байгааг “Одоо” хэсэгт харуулна. Шүүлтүүр ашиг баталгаажуулахгүй.</li>
        <li><strong>Ботыг эхлүүлэх</strong>: бот сонгосон хэрэгслийн дүрмээр арилжаа нээж, stop, target эсвэл дүрмийн хаах цагаар хаана. Таныг зогсоох хүртэл өдөр бүр ажиллана.</li>
        <li><strong>Зогсоох</strong>: хүссэн үедээ дарж ботыг зогсооно. Нээлттэй арилжаанууд хаагдана. <strong>Бүгдийг хаах</strong> нь ботыг зогсоохгүйгээр арилжаануудыг хаана.</li>
        <li>Бот зөвхөн таны Windows компьютер эсвэл VPS болон MT5 <strong>асаалттай</strong>, Algo Trading ногоон үед ажиллана. Холболт 30 секундээс удаан тасарвал шинээр арилжаа нээхгүй.</li>
        <li><strong>Жинхэнэ данс</strong> дээр ажиллуулахын тулд хоёр газар зөвшөөрнө: энэ хуудасны “Жинхэнэ данс” сонголт, мөн MT5 дээр роботын Inputs-ийн <span className={code}>AllowRealAccount = true</span>. Аль нэг нь унтраалттай бол бот жинхэнэ данс дээр арилжаа хийхгүй.</li>
        <li>Алтны зах бямба, ням гарагт хаалттай. Тэр үед эхлүүлсэн ч арилжаа хийгдэхгүй.</li>
    </>,
    footer: <>Файл ажиллахгүй бол эх кодыг <a className="underline" href="/api/bot/download?file=mq5">XauBot.mq5</a> татаж, MetaEditor (F4) дээр нээгээд Compile (F7) дарж болно. Хэрэв зөвхөн Amazon/VPS сервер дээрх MT5-аас сайт руу live үнэ дамжуулах бол зориулалтын <a className="underline font-semibold text-amber-400" href="/api/bot/download?file=feed">XauFeed.mq5 (Live Bridge)</a> татаж ашиглана уу.</>,
  };
}

function botGuideEn({ origin, hasToken, record }: BotGuideProps): ReturnType<typeof botGuideMn> {
  const code = `${CODE} break-all`;
  const steps: Step[] = [
    ["Get MetaTrader 5 ready", <>Open MT5 on your Windows computer or VPS and sign in to your own account. The bot works only while MT5 is running. Always try it on a <strong>demo</strong> account first.</>],
    ["Download the robot file and copy it into MT5", <>
      <a className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/api/bot/download?file=ex5">Download XauBot.ex5</a>. In MT5 click <strong>File → Open Data Folder</strong> and copy the file into <span className={code}>MQL5</span> → <span className={code}>Experts</span> in the folder that opens. Then, in the <strong>Navigator</strong> on the left of MT5 (Ctrl+N), right-click <strong>Expert Advisors</strong> → <strong>Refresh</strong>. XauBot appears in the list.
    </>],
    ["Allow it to reach the web", <>In MT5 open <strong>Tools → Options → Expert Advisors</strong>. Tick <strong>Allow WebRequest for listed URL</strong>, add this address to the list and press OK: <code className={code}>{origin}</code></>],
    ["Open a gold chart", <>Right-click in <strong>Market Watch</strong> (Ctrl+M) → <strong>Symbols</strong> → search for <span className={code}>XAU</span> (<span className={code}>GOLD</span> at some brokers) → <strong>Show Symbol</strong> → OK. Then right-click XAUUSD in Market Watch → <strong>Chart Window</strong>.</>],
    ["Create your own token", <>In the <strong>“Connect the MT5 robot”</strong> section at the bottom of this page press <strong>Create token</strong> and copy the long code it shows. The token is shown only once. It is the key that ties your MT5 to your Bot page alone, so give it to nobody.{hasToken ? " (You already have a token.)" : ""}</>],
    ["Put the robot on the chart", <>Drag <strong>XauBot</strong> from the Navigator onto the gold chart. In the window that opens, on the <strong>Inputs</strong> tab, paste your token into the <span className={code}>BotToken</span> row. <span className={code}>ServerUrl</span> must be <code className={code}>{origin}/api/bot/sync</code>. On the <strong>Common</strong> tab tick <strong>Allow Algo Trading</strong> and press OK.</>],
    ["Switch on Algo Trading", <>Press the <strong>Algo Trading</strong> button in MT5&apos;s top toolbar so that it turns green.</>],
    ["Check", <>The top-left corner of the chart shows <span className={code}>web: connected</span> (<span className={code}>вэб: холбогдсон</span> on an older robot file). This page shows <strong>MT5: connected</strong> along with your account and balance. Now choose and save a tool, then press <strong>Start bot</strong>.{/* i18n-ok: the older robot file's own wording is quoted */}</>],
  ];
  return {
    summary: "Guide: connect your MT5 and use the bot",
    steps,
    useTitle: "Using it",
    use: <>
        <li><strong>Tool</strong>: the bot has four tools. <strong>Setup signals</strong> trades the Setup page&apos;s 3 setups (Asia and two New York openings) by exactly those rules: one trade per setup a day, up to three a day in all. <strong>Day trader</strong> enters on the 15-minute chart when a sweep → MSS → FVG pattern completes and the site&apos;s reading points the same way. <strong>Reading</strong> follows the site&apos;s many-method reading directly. <strong>Basket</strong> is experimental: it opens many trades at once when a signal appears and closes them all together when the total profit or total loss reaches your amount; no claim is made about its results. Choose one, save, then start it.</li>
        {record && <li><strong>Research result</strong>: {recordSentence(record, enT)}</li>}
        <li><strong>Settings</strong>: you set the lots per trade; for the Basket also the number of trades and the profit and loss amounts that close it. There is no upper limit on lots, so choose with the “for every $1 gold moves ±…” figure on the page in view.</li>
        <li><strong>Entry filter</strong>: the Day trader, Reading and Basket must pass checks before opening a trade: the H1 and M15 trend agree, trading hours, not around a HIGH-impact release, volatility (ATR) neither too low nor too high, a narrow spread, RSI not overstretched, price not too far from EMA20, and the daily entry count and daily loss stop. Setup signals follows only the Setup page&apos;s rules. The “Now” section shows why the bot is not entering. The filter does not guarantee profit.</li>
        <li><strong>Start bot</strong>: the bot opens trades by the chosen tool&apos;s rules and closes them at the stop, the target or the rule&apos;s closing time. It keeps running every day until you stop it.</li>
        <li><strong>Stop</strong>: press it whenever you like to stop the bot. Open trades are closed. <strong>Close all</strong> closes the trades without stopping the bot.</li>
        <li>The bot works only while your Windows computer or VPS and MT5 are <strong>on</strong> and Algo Trading is green. If the connection is lost for more than 30 seconds it opens no new trades.</li>
        <li>To run it on a <strong>real account</strong>, allow it in two places: the “Real account” option on this page, and <span className={code}>AllowRealAccount = true</span> in the robot&apos;s Inputs in MT5. If either is off, the bot does not trade on a real account.</li>
        <li>The gold market is closed on Saturday and Sunday. Starting the bot then places no trades.</li>
    </>,
    footer: <>If the file does not work, download the source <a className="underline" href="/api/bot/download?file=mq5">XauBot.mq5</a>, open it in MetaEditor (F4) and press Compile (F7). If you only want to broadcast live price from MT5 on an Amazon/VPS server to the site, download the dedicated <a className="underline font-semibold text-amber-400" href="/api/bot/download?file=feed">XauFeed.mq5 (Live Bridge)</a>.</>,
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

type Windows = [string, string][];

function backtestGuideMn(w: Windows) {
  const code = CODE;
  const steps: Step[] = [
    ["Strategy Tester нээх", <>MT5 дээр <strong>View → Strategy Tester</strong> (Ctrl+R). Гарсан самбараас <strong>Single</strong> тестийг сонгоно.</>],
    ["Тохиргоо", <><strong>Expert</strong>: XauBot. <strong>Symbol</strong>: XAUUSD, <span className={code}>M1</span>. <strong>Date</strong>: Custom period (доорх хугацааг үз). <strong>Modelling</strong>: <span className={code}>Every tick based on real ticks</span>. <strong>Deposit</strong>: өөрийн ашиглах дүн (жишээ нь 1000 USD).</>],
    ["Роботын тохиргоо (Inputs таб)", <><span className={code}>TesterTool</span>: Setup дохиог шалгахдаа Азийн breakout гэж бичсэн «Дүрэм 1» мөрийг, Багцыг шалгахдаа «Багц»-ыг сонгоно. <span className={code}>TesterLots</span> нь арилжаа бүрийн лот. Setup дохионд <span className={code}>TesterMaxOpen</span> нь нэг дор нээлттэй байх арилжааны дээд тоо (3). Багцад <span className={code}>TesterCount</span> (арилжааны тоо), <span className={code}>TesterProfit</span>, <span className={code}>TesterLoss</span> гурвыг 0-ээс их тавина. Бусад мөрийг хөндөхгүй.</>],
    ["Start дарах", <>Анх удаа брокероос tick татах тул хэдэн минут болно. Тест дотор робот вэбтэй холбогдохгүй: нэг ажиллагаа дуусмагц <span className={code}>TesterRestartSeconds</span> секундийн дараа өөрөө дахин эхэлнэ.</>],
    ["Үр дүнг унших", <><strong>Backtest</strong> таб дээр: <strong>Total Net Profit</strong> (нийт дүн), <strong>Profit Factor</strong> (ашиг ÷ алдагдал), <strong>Maximal Drawdown</strong> (хамгийн их уналт), <strong>Total Trades</strong>. <strong>Graph</strong> таб дээр дансны муруй харагдана.</>],
  ];
  return {
    summary: "Заавар: ботыг өнгөрсөн датан дээр шалгах (backtest)",
    intro: <>Жинхэнэ мөнгө тавихаас өмнө роботыг MT5-ийн Strategy Tester дээр брокерын бодит tick, spread-ээр тоглуулж үзнэ. Tester дотор <strong>Setup дохио</strong> болон <strong>Багц</strong>-ыг шалгаж болно. <strong>Өдрийн арилжаа</strong>, <strong>Дүгнэлт</strong> хоёр сайтын шууд дүгнэлтийг ашигладаг бөгөөд tester дотор тэр дүгнэлт байхгүй тул тэднийг demo данс дээр шалгана. Роботын хамгийн сүүлийн файл хэрэгтэй.</>,
    steps,
    periodTitle: "Хэдэн хугацаанд шалгах вэ",
    period: <>Setup дохио өдөрт цөөн арилжаа хийдэг тул 3 сар хангалтгүй. Сүүлийн хоёр жилийг <strong>тусад нь</strong> гүйлгэнэ: <span className={code}>{w[0][0]} – {w[0][1]}</span> ба <span className={code}>{w[1][0]} – {w[1][1]}</span>. Хоёр жилд хоёуланд нь ашигтай гарах ёстой.</>,
    goodTitle: "Юуг сайн үр дүн гэх вэ",
    good: <>
        <li>Setup дохионд жилд дор хаяж 100 арилжаа, Багцад дор хаяж 200. Цөөн арилжааны үр дүн тохиолдлынх байж болно.</li>
        <li>Profit Factor 1.2-оос дээш, Maximal Drawdown таны тэвчих хэмжээнд.</li>
        <li>Хоёр тусдаа хугацаанд хоёуланд нь ашигтай гарах. Нэгд нь л сайн бол найдваргүй.</li>
        <li>Тохиргоог үр дүн сайхан болтол олон дахин өөрчилж болохгүй: тэгвэл өнгөрсөнд тааруулсан болохоос ирээдүйд ажиллах баталгаа болохгүй. Нэг хугацаан дээр тохируулаад, огт хөндөөгүй өөр хугацаан дээр шалгана.</li>
        <li>Тест сайн гарсан ч жинхэнэ данс руу шууд биш, эхлээд demo дээр хэд хоног ажиллуулна.</li>
    </>,
  };
}

function backtestGuideEn(w: Windows): ReturnType<typeof backtestGuideMn> {
  const code = CODE;
  const steps: Step[] = [
    ["Open the Strategy Tester", <>In MT5: <strong>View → Strategy Tester</strong> (Ctrl+R). In the panel that opens choose the <strong>Single</strong> test.</>],
    ["Settings", <><strong>Expert</strong>: XauBot. <strong>Symbol</strong>: XAUUSD, <span className={code}>M1</span>. <strong>Date</strong>: Custom period (see the periods below). <strong>Modelling</strong>: <span className={code}>Every tick based on real ticks</span>. <strong>Deposit</strong>: the amount you would use (for example 1000 USD).</>],
    ["Robot settings (Inputs tab)", <><span className={code}>TesterTool</span>: for Setup signals pick &ldquo;Rule 1&rdquo; (the Asian range breakout row); for the Basket pick &ldquo;Basket&rdquo;. <span className={code}>TesterLots</span> is the lots per trade. For Setup signals, <span className={code}>TesterMaxOpen</span> is the most trades open at once (3). For the Basket, set <span className={code}>TesterCount</span> (the number of trades), <span className={code}>TesterProfit</span> and <span className={code}>TesterLoss</span> all above 0. Leave the other rows alone.</>],
    ["Press Start", <>The first time, it downloads ticks from the broker, which takes a few minutes. Inside a test the robot does not connect to the web: when one run ends it starts again by itself after <span className={code}>TesterRestartSeconds</span> seconds.</>],
    ["Read the result", <>On the <strong>Backtest</strong> tab: <strong>Total Net Profit</strong> (the overall result), <strong>Profit Factor</strong> (profit ÷ loss), <strong>Maximal Drawdown</strong> (the deepest fall) and <strong>Total Trades</strong>. The <strong>Graph</strong> tab shows the account curve.</>],
  ];
  return {
    summary: "Guide: test the bot on past data (backtest)",
    intro: <>Before putting real money on it, replay the robot in MT5&apos;s Strategy Tester on the broker&apos;s real ticks and spread. <strong>Setup signals</strong> and the <strong>Basket</strong> can be tested there. The <strong>Day trader</strong> and <strong>Reading</strong> use the site&apos;s live reading, which the tester does not have, so check those on a demo account instead. You need the newest robot file.</>,
    steps,
    periodTitle: "Which periods to test",
    period: <>Setup signals makes few trades a day, so 3 months is not enough. Run the last two years <strong>separately</strong>: <span className={code}>{w[0][0]} – {w[0][1]}</span> and <span className={code}>{w[1][0]} – {w[1][1]}</span>. It should be profitable in both.</>,
    goodTitle: "What counts as a good result",
    good: <>
        <li>At least 100 trades a year for Setup signals, at least 200 for the Basket. A result from few trades can be chance.</li>
        <li>Profit Factor above 1.2, and a Maximal Drawdown you could live with.</li>
        <li>Profitable in both separate periods. Good in only one of them is not reliable.</li>
        <li>Do not keep changing the settings until the result looks good: that fits them to the past and is no guarantee for the future. Tune on one period, then check on another you have not touched.</li>
        <li>Even after a good test, do not go straight to a real account: run it on demo for some days first.</li>
    </>,
  };
}

/** How to replay the robot over past ticks in MetaTrader's own Strategy Tester. The test periods are the two years before `now`. */
export function BacktestGuide({ v = MN_VIEWER, now = new Date() }: { v?: Viewer; now?: Date }) {
  const w = testWindows(now);
  const c = v.locale === "en" ? backtestGuideEn(w) : backtestGuideMn(w);
  return (
    <details className="card">
      <Summary>{c.summary}</Summary>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300">{c.intro}</p>
      <Steps steps={c.steps} />
      <h3 className="mt-5 border-t border-zinc-800 pt-4 text-sm font-semibold text-zinc-100">{c.periodTitle}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">{c.period}</p>
      <h3 className="mt-5 border-t border-zinc-800 pt-4 text-sm font-semibold text-zinc-100">{c.goodTitle}</h3>
      <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">{c.good}</ul>
    </details>
  );
}
