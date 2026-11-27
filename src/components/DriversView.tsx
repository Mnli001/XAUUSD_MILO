import type { DriversView as View, SeriesStat } from "@/lib/drivers";
import type { Viewer } from "@/lib/viewer";

/** A small line of the last values, no axes: the shape, not the numbers (the numbers are beside it). */
function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), w = 160, h = 36;
  const y = (v: number) => (max === min ? h / 2 : h - 2 - ((v - min) / (max - min)) * (h - 4));
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className="mt-3 h-9 w-full" preserveAspectRatio="none"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-amber-300/80" /></svg>;
}

const signed = (x: number | null, digits: number, unit = "") => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits)}${unit}`);

function corrText(c: number | null, v: Viewer): string {
  const { t } = v;
  if (c === null) return t("Алттай хамаарлыг тооцох өгөгдөл хүрэлцэхгүй.", "Not enough data to measure its link with gold.");
  const n = c.toFixed(2);
  if (c <= -0.2) return t(`Сүүлийн 60 өдөрт алттай эсрэг хөдөлсөн (${n}): энэ өсөхөд алт ихэвчлэн унасан.`, `Over the last 60 days it moved against gold (${n}): when it rose, gold mostly fell.`);
  if (c >= 0.2) return t(`Сүүлийн 60 өдөрт алттай хамт хөдөлсөн (${n}).`, `Over the last 60 days it moved with gold (${n}).`);
  return t(`Сүүлийн 60 өдөрт алттай бараг холбоогүй хөдөлсөн (${n}).`, `Over the last 60 days it moved almost independently of gold (${n}).`);
}

function Tile({ title, what, s, digits, unit, v }: { title: string; what: string; s: SeriesStat | null; digits: number; unit: string; v: Viewer }) {
  const { t } = v;
  return (
    <section className="card" aria-label={title}>
      <h2 className="card-title">{title}</h2>
      {s ? (
        <>
          <p className="mt-2 text-3xl font-semibold text-zinc-50 tabular-nums">{s.last.toFixed(digits)}{unit}</p>
          <p className="mt-1 text-xs text-zinc-500 tabular-nums">{t("7 хоногт", "1 week")} {signed(s.week, digits, unit)} · {t("сард", "1 month")} {signed(s.month, digits, unit)} · {s.date}</p>
          <Spark values={s.spark} label={t(`${title}: сүүлийн 90 ажлын өдөр`, `${title}: the last 90 business days`)} />
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{what}</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{corrText(s.corr60, v)}</p>
        </>
      ) : <p className="mt-2 text-sm text-zinc-500">{t("Өгөгдөл хараахан ирээгүй. Өдөрт нэг удаа шинэчилнэ.", "No data yet. It updates once a day.")}</p>}
    </section>
  );
}

/** The panel: a one-paragraph reading first, then the dollar, real and nominal yields, and futures positioning. */
export function DriversPanel({ d, v }: { d: View; v: Viewer }) {
  const { t } = v;
  const lines: string[] = [];
  if (d.tilt.dollar) lines.push(d.tilt.dollar === "down" ? t("Доллар сүүлийн сард суларсан: алтанд ихэвчлэн дэмжлэг.", "The dollar weakened over the last month: usually supportive for gold.") : t("Доллар сүүлийн сард чангарсан: алтанд ихэвчлэн дарамт.", "The dollar strengthened over the last month: usually a headwind for gold."));
  if (d.tilt.real) lines.push(d.tilt.real === "down" ? t("Бодит хүү буурсан: хүү өгдөггүй алтыг барих зардал багассан.", "Real yields fell: holding gold, which pays no interest, got cheaper.") : t("Бодит хүү өссөн: алтыг барих зардал нэмэгдсэн.", "Real yields rose: holding gold got more expensive."));
  if (d.tilt.cot === "crowded") lines.push(t("Спекулянтуудын long байр 1 жилийн дээд түвшинд: олон хүн нэг талд, огцом буулт гарч болзошгүй.", "Speculators' net long is near its 1-year high: a crowded side, sharp pullbacks are possible."));
  if (d.tilt.cot === "light") lines.push(t("Спекулянтуудын long байр 1 жилийн доод түвшинд: өсөх зай их.", "Speculators' net long is near its 1-year low: plenty of room for buying."));
  const cot = d.cot;
  return (
    <div className="space-y-4 sm:space-y-5">
      {lines.length > 0 && <section className="card" aria-label={t("Товч дүгнэлт", "In short")}><ul className="space-y-1.5 text-sm leading-relaxed text-zinc-200">{lines.map((l) => <li key={l}>{l}</li>)}</ul></section>}
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <Tile title={t("Долларын индекс (broad)", "Dollar index (broad)")} what={t("Долларын бусад валютын эсрэг ханш. Алт доллараар үнэлэгддэг тул доллар суларвал алт үнэтэй болдог.", "The dollar against other currencies. Gold is priced in dollars, so a weaker dollar usually lifts gold.")} s={d.dollar} digits={2} unit="" v={v} />
        <Tile title={t("10 жилийн бодит хүү", "10-year real yield")} what={t("Инфляцаас давсан хүү (TIPS). Энэ өндөр байвал хүүгүй алтыг барих нь үнэтэй.", "The yield above inflation (TIPS). When it is high, holding gold, which pays nothing, costs more.")} s={d.real} digits={2} unit="%" v={v} />
        <Tile title={t("10 жилийн нэрлэсэн хүү", "10-year nominal yield")} what={t("АНУ-ын засгийн газрын 10 жилийн бондын өгөөж.", "The yield on 10-year US government bonds.")} s={d.nominal} digits={2} unit="%" v={v} />
        <section className="card" aria-label={t("COT: спекулянтуудын байр", "COT: speculators' position")}>
          <h2 className="card-title">{t("COT: спекулянтуудын байр", "COT: speculators' position")}</h2>
          {cot ? (
            <>
              <p className="mt-2 text-3xl font-semibold text-zinc-50 tabular-nums">{cot.net.toLocaleString("en-US")}</p>
              <p className="mt-1 text-xs text-zinc-500 tabular-nums">{t("цэвэр long гэрээ", "net long contracts")} · {t("7 хоногт", "1 week")} {signed(cot.change, 0)} · {cot.date}</p>
              <Spark values={cot.spark} label={t("Цэвэр long: сүүлийн 52 долоо хоног", "Net long: the last 52 weeks")} />
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{t("COMEX алтны фьючерст арилжаачдын (non-commercial) long-оос short-ыг хассан тоо, CFTC-ийн долоо хоног бүрийн тайлангаас.", "Non-commercial traders' long minus short in COMEX gold futures, from the CFTC's weekly report.")}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">{t(`Нийт нээлттэй гэрээний ${cot.longPct}%. 1 жилийн дотор ${cot.rank52}-р хувьд (100 = хамгийн их).`, `${cot.longPct}% of open interest. ${cot.rank52}th percentile of the past year (100 = the most).`)}</p>
            </>
          ) : <p className="mt-2 text-sm text-zinc-500">{t("Өгөгдөл хараахан ирээгүй. Долоо хоног бүр шинэчилнэ.", "No data yet. It updates weekly.")}</p>}
        </section>
      </div>
      <p className="text-xs text-zinc-500">{t("Эх сурвалж: FRED (St. Louis Fed), CFTC Commitments of Traders. Санхүүгийн зөвлөгөө биш.", "Sources: FRED (St. Louis Fed), CFTC Commitments of Traders. Not financial advice.")}</p>
    </div>
  );
}
