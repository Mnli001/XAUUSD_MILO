import { getEvents, getReactions } from "@/lib/events";
import { zonedToUtc } from "@/lib/time";
import { NewsList } from "@/components/NewsList";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Мэдээ", "News") };
}

export default async function NewsPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const from = zonedToUtc(v.date(now), "00:00", v.timeZone);
  const [events, reactions] = await Promise.all([getEvents(from, new Date(from.getTime() + 14 * 864e5)), getReactions()]);
  const key: [string, string][] = [["bg-red-500", t("Өндөр нөлөө", "High impact")], ["bg-amber-400", t("Дунд нөлөө", "Medium impact")], ["bg-zinc-500", t("Бага нөлөө", "Low impact")]];
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Мэдээний календарь", "News calendar")}</h1>
        <p className="page-lede">{t(`Дараагийн 14 хоног, цаг нь ${v.zone}-аар. Мөр дээр дарвал өмнө нь ийм мэдээний дараа алт хэрхэн хөдөлснийг харуулна.`, `The next 14 days, times in ${v.zone}. Tap a row to see how gold moved after this kind of release before.`)}</p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-zinc-400">
          {key.map(([c, label]) => <li key={c} className="flex items-center gap-2"><span aria-hidden className={`line-badge ${c}`} />{label}</li>)}
        </ul>
      </div>
      <NewsList events={events} reactions={reactions} now={now} v={v} />
    </div>
  );
}
