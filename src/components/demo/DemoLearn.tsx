"use client";
import type { MissionId } from "@/lib/demo/demo";
import type { T } from "@/lib/i18n";
import { useViewer } from "../PrefsProvider";

function missionText(id: MissionId, t: T): { title: string; how: string } {
  switch (id) {
    case "sl": return { title: t("SL-тэй анхны арилжаа", "A first trade with a stop loss"), how: t("BUY эсвэл SELL сонгоод, Stop loss дээр $5 товч дараад нээ. SL нь буруу явбал хэр их алдахаа урьдчилж тогтоох арга.", "Pick BUY or SELL, press $5 under Stop loss and place it. A stop fixes in advance how much you can lose.") };
    case "pending": return { title: t("Limit эсвэл Stop захиалга тавих", "Place a Limit or Stop order"), how: t("Limit эсвэл Stop сонгоод чарт дээр дарж үнээ сонго. Үнэ тэнд хүрэхэд арилжаа өөрөө нээгдэнэ.", "Choose Limit or Stop and click the chart to pick its price. The trade opens by itself when the price gets there.") };
    case "tp": return { title: t("TP-д хүрч хаагдсан арилжаа", "A trade closed at its target"), how: t("TP-ийн 1:2 товчоор зорилтоо SL-ийн зайнаас 2 дахин хол тавь. Үнэ хүрэхэд ашгаа автоматаар авна.", "Use 1:2 under Take profit to set the target twice the stop's distance. The profit is taken for you when it is reached.") };
    case "breakeven": return { title: t("SL-ээ breakeven рүү зөөх", "Move a stop to breakeven"), how: t("Арилжаа ашигтай гарсны дараа нээлттэй арилжааны BE товчийг дар. Ингэснээр тэр арилжаанаас алдах эрсдэл арилна.", "Once a trade is in profit, press BE on it. From then on that trade cannot lose.") };
    case "partial": return { title: t("Хэсэгчлэн хаах", "Close part of a trade"), how: t("Ашигтай арилжааны ½ товчийг дар: хагас ашгаа баталгаажуулж, үлдсэнийг нь цааш явуулна.", "Press ½ on a winning trade: bank half the profit and let the rest run.") };
    case "notes": return { title: t("Шалтгаанаа бичсэн 3 арилжаа", "3 trades with a written reason"), how: t("Арилжаа бүрийн өмнө \"Яагаад?\" хэсэгт шалтгаанаа бич. Дараа нь түүхээс аль шалтгаан ажилладагийг харна.", "Before each trade write the reason under \"Why?\". Later the history shows which reasons work.") };
    case "smallRisk": return { title: t("1%-иас бага эрсдэлтэй 5 арилжаа", "5 trades risking under 1%"), how: t("SL тавиад \"Эрсдэлээр lot тооцох\" дээр 1%-ийг дар. Lot өөрөө тооцогдоно.", "Set a stop, then press 1% under Size by risk. The lots are worked out for you.") };
  }
}

/** The beginner's steps, ticked off from what they have done on this account. */
export function DemoMissions({ missions }: { missions: { id: MissionId; count: number; goal: number }[] }) {
  const { t } = useViewer();
  const done = missions.filter((m) => m.count >= m.goal).length;
  const next = missions.find((m) => m.count < m.goal);
  return (
    <section className="card" aria-labelledby="missions-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="missions-h" className="text-base font-semibold text-zinc-50">{t("Эхлэгчийн даалгавар", "Beginner's tasks")}</h2>
        <span className="text-sm text-zinc-400 tabular-nums">{done}/{missions.length}</span>
      </div>
      <span aria-hidden className="mt-2 block h-1.5 rounded-full bg-zinc-800"><span className="block h-1.5 rounded-full bg-amber-400" style={{ width: `${(done / missions.length) * 100}%` }} /></span>
      <ol className="mt-4 space-y-2.5">
        {missions.map((m) => {
          const ok = m.count >= m.goal;
          const txt = missionText(m.id, t);
          return (
            <li key={m.id} className="flex gap-3 text-sm">
              <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ok ? "bg-emerald-500 text-zinc-950" : "border border-zinc-600 text-zinc-500"}`}>{ok ? "✓" : ""}</span>
              <span className="min-w-0">
                <span className={ok ? "text-zinc-500 line-through" : "text-zinc-100"}>{txt.title}</span>
                {m.goal > 1 && !ok && <span className="ml-1.5 text-xs text-zinc-500 tabular-nums">{m.count}/{m.goal}</span>}
                {m === next && <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">{txt.how}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {!next && <p className="mt-4 text-sm text-emerald-300">{t("Бүгдийг хийлээ. Одоо 20+ арилжаа хийж, Статистик дээрээс өөрийн давуу талаа хай.", "All done. Now take 20+ trades and look for your edge in Stats.")}</p>}
    </section>
  );
}

/** How a trade works, in six short steps, folded away until wanted. */
export function DemoGuide() {
  const { t } = useViewer();
  const steps = [
    [t("Bid, ask, spread", "Bid, ask, spread"), t("BUY нь ask (өндөр) үнээр, SELL нь bid (бага) үнээр нээгдэнэ. Хоёрын зөрүү буюу spread нь broker-ийн орлого. Тиймээс шинэ арилжаа бүр бага зэрэг хасахаас эхэлдэг.", "A BUY opens at the ask (the higher price), a SELL at the bid. The gap, the spread, is the broker's fee, which is why every new trade starts slightly in the red.")],
    [t("Lot ба мөнгө", "Lots and money"), t("1 lot = 100 унц алт. 0.01 lot дээр үнэ $1 хөдлөхөд $1, 0.10 lot дээр $10, 1 lot дээр $100 болно.", "1 lot = 100 oz of gold. On 0.01 lot a $1 move is $1, on 0.10 lot $10, on 1 lot $100.")],
    [t("SL ба TP-гүйгээр нээхгүй", "Never without a stop and target"), t("SL нь алдагдлыг, TP нь ашгийг автоматаар хаана. Арилжааг нээхээсээ өмнө хаана гарахаа шийднэ.", "The stop closes a loss and the target a win, by themselves. Decide where you get out before you get in.")],
    [t("1%-ийн дүрэм", "The 1% rule"), t("Нэг арилжаанд дансныхаа 1%-иас илүүг эрсдэлд бүү оруул. 10 удаа дараалан алдсан ч данс 90%-тай үлдэнэ. \"Эрсдэлээр lot тооцох\" товч үүнийг тооцож өгнө.", "Risk no more than 1% of the account on one trade: ten losses in a row still leave 90%. Size by risk works it out.")],
    [t("Margin ба leverage", "Margin and leverage"), t("Арилжаа нээхэд мөнгөний тань нэг хэсэг margin болж түгжигдэнэ. Equity / margin = margin level. 100%-д margin call, 50%-д хамгийн их алдагдалтай арилжаа автоматаар хаагдана (stop-out).", "Opening a trade locks part of your money as margin. Equity over margin is the margin level: a margin call at 100%, and at 50% the worst trade is closed for you (stop-out).")],
    [t("Limit ба Stop захиалга", "Limit and Stop orders"), t("Limit: илүү сайн үнээр орох (буцалт хүлээх). Stop: түвшин эвдрэхэд орох (breakout). Хоёулаа үнэ хүрэхэд өөрөө нээгдэнэ, та сайт дээр байх шаардлагагүй.", "Limit: get in at a better price (waiting for a pullback). Stop: get in when a level breaks (a breakout). Both open by themselves when the price gets there, even with the site closed.")],
  ];
  return (
    <details className="card group">
      <summary className="cursor-pointer list-none text-base font-semibold text-zinc-50">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>{t("Арилжаа хэрхэн хийдэг вэ: 6 алхам", "How a trade works: 6 steps")}
      </summary>
      <ol className="mt-4 space-y-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-amber-300">{i + 1}</span>
            <span><span className="block text-sm font-semibold text-zinc-100">{title}</span><span className="mt-0.5 block text-sm leading-relaxed text-zinc-400">{body}</span></span>
          </li>
        ))}
      </ol>
    </details>
  );
}
