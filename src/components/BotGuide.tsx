/** Step-by-step: how a user connects their own MetaTrader 5 to their own bot page. */
export function BotGuide({ origin, hasToken, online }: { origin: string; hasToken: boolean; online: boolean }) {
  const code = "rounded bg-zinc-800 px-1.5 py-0.5 break-all";
  const steps: [string, React.ReactNode][] = [
    ["MetaTrader 5-аа бэлдэх", <>Windows компьютер дээрээ MT5-г нээж, өөрийн дансаар нэвтэрнэ. Эхлээд заавал <strong>demo</strong> дансаар туршаарай.</>],
    ["Роботын файлыг татаж, MT5-д хуулах", <>
      <a className="text-amber-400 underline" href="/api/bot/download?file=ex5">XauBot.ex5 татах</a>. MT5 дээр <strong>File → Open Data Folder</strong> дарж, нээгдсэн хавтасны <span className={code}>MQL5</span> → <span className={code}>Experts</span> дотор файлыг хуулна. Дараа нь MT5-ийн зүүн талын <strong>Navigator</strong> (Ctrl+N) дотор <strong>Expert Advisors</strong> дээр баруун товч → <strong>Refresh</strong>. Жагсаалтад XauBot гарч ирнэ.
    </>],
    ["Вэбтэй холбогдохыг зөвшөөрөх", <>MT5 дээр <strong>Tools → Options → Expert Advisors</strong> таб. <strong>Allow WebRequest for listed URL</strong>-ийг чагталж, жагсаалтад энэ хаягийг нэмээд OK: <code className={code}>{origin}</code></>],
    ["Алтны чарт нээх", <><strong>Market Watch</strong> (Ctrl+M) дээр баруун товч → <strong>Symbols</strong> → <span className={code}>XAU</span> гэж хайж (зарим брокерт <span className={code}>GOLD</span>) → <strong>Show Symbol</strong> → OK. Дараа нь Market Watch дээрх XAUUSD дээр баруун товч → <strong>Chart Window</strong>.</>],
    ["Өөрийн токеноо үүсгэх", <>Энэ хуудасны доод талын <strong>“MT5 роботыг холбох”</strong> хэсэгт <strong>Токен үүсгэх</strong> дарж, гарсан урт кодыг хуулж авна. Токен нэг л удаа харагдана. Энэ нь таны MT5-г зөвхөн таны Бот хуудастай холбодог түлхүүр тул хэнд ч бүү өг.{hasToken ? " (Танд токен үүссэн байна.)" : ""}</>],
    ["Роботыг чарт дээр тавих", <>Navigator-оос <strong>XauBot</strong>-ыг алтны чарт руу чирнэ. Гарсан цонхны <strong>Inputs</strong> таб дээр <span className={code}>BotToken</span> мөрөнд токеноо буулгана. <span className={code}>ServerUrl</span> нь <code className={code}>{origin}/api/bot/sync</code> байх ёстой. <strong>Common</strong> таб дээр <strong>Allow Algo Trading</strong>-ийг чагтлаад OK.</>],
    ["Algo Trading асаах", <>MT5-ийн дээд самбарын <strong>Algo Trading</strong> товчийг дарж ногоон болгоно.</>],
    ["Шалгах", <>Чартын зүүн дээд буланд <span className={code}>вэб: холбогдсон</span> гэж гарна. Энэ хуудсан дээр <strong>MT5: холбогдсон</strong> болж, данс, үлдэгдэл чинь харагдана. Одоо тохиргоогоо хийгээд <strong>Start bot</strong> дарж болно.</>],
  ];
  return (
    <details className="card" open={!online}>
      <summary className="flex min-h-6 cursor-pointer items-center justify-between gap-3 text-sm font-medium text-zinc-100">Заавар: MT5-аа холбох, ботыг ашиглах<svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-500 transition-transform [details[open]_&]:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
      <ol className="mt-4 max-w-3xl space-y-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-xs text-amber-400">{i + 1}</span>
            <div><div className="font-medium text-zinc-100">{title}</div><div className="mt-0.5 leading-relaxed text-zinc-300">{body}</div></div>
          </li>
        ))}
      </ol>
      <h3 className="mt-5 text-sm font-medium text-zinc-200">Ашиглах</h3>
      <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
        <li><strong>Хэрэгсэл</strong>: бот хоёр хэрэгсэлтэй. <strong>Scalper</strong> нэг нэгээр орж арилжаа бүрийг өөрийн stop, target-аар хаана. <strong>Багц</strong> дохио гармагц олон арилжааг зэрэг нээж, нийт ашиг таны тавьсан $ дүнд хүрмэгц (эсвэл нийт алдагдал таны тавьсан хязгаарт хүрвэл) бүгдийг зэрэг хаана. Сонгоод хадгалсны дараа Start дарна.</li>
        <li><strong>Тохиргоо</strong>: арилжаа бүрийн лот, зэрэг нээх арилжааны тоо, stop/target-ийг өөрөө тавина. Лотын дээд хязгаар байхгүй тул хуудсан дээрх “алт $1 хөдлөхөд ±…” тооцоог харж сонгоорой.</li>
        <li><strong>Start bot</strong>: бот дохио гармагц өөрөө BUY эсвэл SELL орж, хэр удаан ажиллахаа өөрөө тооцоод, хугацаа дуусах, зорилтод хүрэх эсвэл чиглэл эргэхэд арилжаагаа хааж өөрөө зогсоно.</li>
        <li><strong>Stop</strong>: хүссэн үедээ дарж ботыг зогсооно. Нээлттэй арилжаанууд хаагдана. <strong>Бүгдийг хаах</strong> нь ботыг зогсоохгүйгээр арилжаануудыг хаана.</li>
        <li>Бот зөвхөн таны компьютер болон MT5 <strong>асаалттай</strong>, Algo Trading ногоон үед ажиллана. Холболт 30 секундээс удаан тасарвал шинээр арилжаа нээхгүй.</li>
        <li><strong>Жинхэнэ данс</strong> дээр ажиллуулахын тулд хоёр газар зөвшөөрнө: энэ хуудасны “Жинхэнэ данс” сонголт, мөн MT5 дээр роботын Inputs-ийн <span className={code}>AllowRealAccount = true</span>. Аль нэг нь унтраалттай бол бот жинхэнэ данс дээр арилжаа хийхгүй.</li>
        <li>Алтны зах бямба, ням гарагт хаалттай. Тэр үед Start дарсан ч арилжаа хийгдэхгүй.</li>
      </ul>
      <p className="mt-3 text-xs text-zinc-500">Файл ажиллахгүй бол эх кодыг <a className="underline" href="/api/bot/download?file=mq5">XauBot.mq5</a> татаж, MetaEditor (F4) дээр нээгээд Compile (F7) дарж болно.</p>
    </details>
  );
}

/** How to replay the robot over past ticks in MetaTrader's own Strategy Tester. */
export function BacktestGuide() {
  const code = "rounded bg-zinc-800 px-1.5 py-0.5";
  const steps: [string, React.ReactNode][] = [
    ["Strategy Tester нээх", <>MT5 дээр <strong>View → Strategy Tester</strong> (Ctrl+R). Гарсан самбараас <strong>Single</strong> тестийг сонгоно.</>],
    ["Тохиргоо", <><strong>Expert</strong>: XauBot. <strong>Symbol</strong>: XAUUSD, <span className={code}>M1</span>. <strong>Date</strong>: Custom period, эхлээд сүүлийн 3 сар. <strong>Modelling</strong>: <span className={code}>Every tick based on real ticks</span>. <strong>Deposit</strong>: өөрийн ашиглах дүн (жишээ нь 1000 USD).</>],
    ["Роботын тохиргоо (Inputs таб)", <><span className={code}>TesterTool</span>: Scalper эсвэл Basket. <span className={code}>TesterLots</span>, <span className={code}>TesterCount</span> нь лот, арилжааны тоо. Scalper-т <span className={code}>TesterSlAtr</span>, <span className={code}>TesterTpAtr</span>. Багцад <span className={code}>TesterProfit</span>, <span className={code}>TesterLoss</span> хоёрыг заавал 0-ээс их тавина. Бусад мөрийг хөндөхгүй.</>],
    ["Start дарах", <>Анх удаа брокероос tick татах тул хэдэн минут болно. Тест дотор робот вэбтэй холбогдохгүй: нэг ажиллагаа дуусмагц <span className={code}>TesterRestartSeconds</span> секундийн дараа дахин Start дарсантай адил өөрөө эхэлнэ.</>],
    ["Үр дүнг унших", <><strong>Backtest</strong> таб дээр: <strong>Total Net Profit</strong> (нийт дүн), <strong>Profit Factor</strong> (ашиг ÷ алдагдал), <strong>Maximal Drawdown</strong> (хамгийн их уналт), <strong>Total Trades</strong>. <strong>Graph</strong> таб дээр дансны муруй харагдана.</>],
  ];
  return (
    <details className="card">
      <summary className="flex min-h-6 cursor-pointer items-center justify-between gap-3 text-sm font-medium text-zinc-100">Заавар: ботыг өнгөрсөн датан дээр шалгах (backtest)<svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-500 transition-transform [details[open]_&]:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300">Жинхэнэ мөнгө тавихаас өмнө роботыг MT5-ийн Strategy Tester дээр брокерын бодит tick, spread-ээр тоглуулж үзнэ. Роботын v2.10 ба түүнээс шинэ файл хэрэгтэй.</p>
      <ol className="mt-4 max-w-3xl space-y-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-xs text-amber-400">{i + 1}</span>
            <div><div className="font-medium text-zinc-100">{title}</div><div className="mt-0.5 leading-relaxed text-zinc-300">{body}</div></div>
          </li>
        ))}
      </ol>
      <h3 className="mt-5 text-sm font-medium text-zinc-200">Юуг сайн үр дүн гэх вэ</h3>
      <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
        <li>Дор хаяж 200 арилжаа гарсан байх. Цөөн арилжааны үр дүн тохиолдлынх байж болно.</li>
        <li>Profit Factor 1.2-оос дээш, Maximal Drawdown таны тэвчих хэмжээнд.</li>
        <li>Өөр хоёр хугацаанд (жишээ нь сүүлийн 3 сар, түүний өмнөх 3 сар) хоёуланд нь ашигтай гарах. Нэгд нь л сайн бол найдваргүй.</li>
        <li>Тохиргоог үр дүн сайхан болтол олон дахин өөрчилж болохгүй: тэгвэл өнгөрсөнд тааруулсан болохоос ирээдүйд ажиллах баталгаа болохгүй. Нэг хугацаан дээр тохируулаад, огт хөндөөгүй өөр хугацаан дээр шалгана.</li>
        <li>Тест сайн гарсан ч жинхэнэ данс руу шууд биш, эхлээд demo дээр хэд хоног ажиллуулна.</li>
      </ul>
    </details>
  );
}
