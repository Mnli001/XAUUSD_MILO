import { getEvents, getReactions } from "@/lib/events";
import { ubDateKey, ubLocalToUtc } from "@/lib/time";
import { NewsList } from "@/components/NewsList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Мэдээ — XAU Analytics" };

export default async function NewsPage() {
  const now = new Date();
  const from = ubLocalToUtc(ubDateKey(now), "00:00");
  const [events, reactions] = await Promise.all([getEvents(from, new Date(from.getTime() + 14 * 864e5)), getReactions()]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Мэдээний календарь</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">Дараагийн 14 хоног, Улаанбаатарын цагаар. Мөр дээр дарвал өмнө нь ийм мэдээний дараа алт хэрхэн хөдөлснийг харуулна.</p>
      </div>
      <NewsList events={events} reactions={reactions} now={now} />
    </div>
  );
}
