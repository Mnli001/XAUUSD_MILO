import type { ReactNode } from "react";
import { MN_VIEWER, type Viewer } from "@/lib/viewer";
import { testWindows } from "@/lib/siteCopy";

/*
 * The backtest guide (admin research only) is prose with menu names and code woven through every sentence, so each
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

type Windows = [string, string][];

function backtestGuideMn(w: Windows) {
  const code = CODE;
  const steps: Step[] = [
    ["Strategy Tester нээх", <>MT5 дээр <strong>View → Strategy Tester</strong> (Ctrl+R). Гарсан самбараас <strong>Single</strong> тестийг сонгоно.</>],
    ["Тохиргоо", <><strong>Expert</strong>: XauBot. <strong>Symbol</strong>: XAUUSD, <span className={code}>M1</span>. <strong>Date</strong>: Custom period (доорх хугацааг үз). <strong>Modelling</strong>: <span className={code}>Every tick based on real ticks</span>. <strong>Deposit</strong>: өөрийн ашиглах дүн (жишээ нь 1000 USD).</>],
    ["Роботын тохиргоо (Inputs таб)", <><span className={code}>TesterTool</span>: Setup дохиог шалгахдаа Азийн breakout гэж бичсэн «Дүрэм 1» мөрийг, Багцыг шалгахдаа «Багц»-ыг сонгоно. <span className={code}>TesterLots</span> нь арилжаа бүрийн lot. Setup дохионд <span className={code}>TesterMaxOpen</span> нь нэг дор нээлттэй байх арилжааны дээд тоо (3). Багцад <span className={code}>TesterCount</span> (арилжааны тоо), <span className={code}>TesterProfit</span>, <span className={code}>TesterLoss</span> гурвыг 0-ээс их тавина. Бусад мөрийг хөндөхгүй.</>],
    ["Start дарах", <>Анх удаа broker-оос tick татах тул хэдэн минут болно. Тест дотор робот вэбтэй холбогдохгүй: нэг ажиллагаа дуусмагц <span className={code}>TesterRestartSeconds</span> секундийн дараа өөрөө дахин эхэлнэ.</>],
    ["Үр дүнг унших", <><strong>Backtest</strong> таб дээр: <strong>Total Net Profit</strong> (нийт дүн), <strong>Profit Factor</strong> (ашиг ÷ алдагдал), <strong>Maximal Drawdown</strong> (хамгийн их уналт), <strong>Total Trades</strong>. <strong>Graph</strong> таб дээр дансны муруй харагдана.</>],
  ];
  return {
    summary: "Заавар: ботыг өнгөрсөн датан дээр шалгах (backtest)",
    intro: <>Жинхэнэ мөнгө тавихаас өмнө роботыг MT5-ийн Strategy Tester дээр broker-ын бодит tick, spread-ээр тоглуулж үзнэ. Tester дотор <strong>Setup дохио</strong> болон <strong>Багц</strong>-ыг шалгаж болно. <strong>Өдрийн арилжаа</strong>, <strong>Дүгнэлт</strong> хоёр сайтын шууд дүгнэлтийг ашигладаг бөгөөд tester дотор тэр дүгнэлт байхгүй тул тэднийг demo данс дээр шалгана. Роботын хамгийн сүүлийн файл хэрэгтэй.</>,
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
