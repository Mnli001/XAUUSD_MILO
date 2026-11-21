import Link from "next/link";
import { headers } from "next/headers";
import { getLiveView } from "@/lib/bot/liveDb";
import { BotPanel } from "@/components/BotPanel";

export const dynamic = "force-dynamic";

export default async function BotPage() {
  const view = await getLiveView(new Date());
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Бот</h1>
          <p className="text-sm text-zinc-400">MT5 дээрх роботыг эндээс асааж, зогсоож, тохируулж, хянана. Арилжааг робот өөрөө брокерын бодит цагийн үнээр хийнэ.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/bot/backtest" className="text-amber-400">Backtest</Link>
          <Link href="/admin/bot/paper" className="text-amber-400">Цаасан арилжаа</Link>
        </div>
      </div>
      <BotPanel initial={JSON.parse(JSON.stringify(view))} syncUrl={`${proto}://${host}/api/bot/sync`} />
      <p className="text-xs text-zinc-500">Scalper арга шалгагдаагүй: өнгөрсөн дата дээр ашигтай гэдэг нь нотлогдоогүй. Ашиг баталгаагүй, алдагдал хүлээх эрсдэлтэй. Санхүүгийн зөвлөгөө биш.</p>
    </div>
  );
}
