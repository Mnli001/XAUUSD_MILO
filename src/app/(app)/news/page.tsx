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
        <h1 className="text-xl font-semibold">Мэдээний календарь</h1>
        <p className="text-sm text-zinc-400">Дараагийн 14 хоног · цаг Улаанбаатарын цагаар · мөр дээр дарж түүхэн хариу үйлдлийг харна</p>
      </div>
      <NewsList events={events} reactions={reactions} now={now} />
    </div>
  );
}
