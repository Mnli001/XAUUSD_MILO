import { getEvents, getReactions } from "@/lib/events";
import { zonedToUtc } from "@/lib/time";
import { NewsList } from "@/components/NewsList";
import { getT, getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Мэдээ — XAU Analytics", "News — XAU Analytics") };
}

export default async function NewsPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const from = zonedToUtc(v.date(now), "00:00", v.timeZone);
  const [events, reactions] = await Promise.all([getEvents(from, new Date(from.getTime() + 14 * 864e5)), getReactions()]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t("Мэдээний календарь", "News calendar")}</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">{t(`Дараагийн 14 хоног, цаг нь ${v.zone}-аар. Мөр дээр дарвал өмнө нь ийм мэдээний дараа алт хэрхэн хөдөлснийг харуулна.`, `The next 14 days, times in ${v.zone}. Tap a row to see how gold moved after this kind of release before.`)}</p>
      </div>
      <NewsList events={events} reactions={reactions} now={now} v={v} />
    </div>
  );
}
