import Link from "next/link";

export const dynamic = "force-dynamic";

export default function BotResearchPage() {
  return (
    <div className="space-y-4">
      <h1 className="page-title">Ботын судалгаа</h1>
      <p className="text-sm text-zinc-400">Ботыг удирдах хуудас хэрэглэгч бүрд тусдаа болсон: <Link href="/bot" className="text-amber-400">Бот</Link>. Энд зөвхөн дүрмийн судалгаа байна.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/bot/backtest" className="card hover:border-zinc-600"><div className="font-medium">Backtest</div><p className="mt-1 text-sm text-zinc-400">Дүрмийг өнгөрсөн дата дээр шалгах.</p></Link>
        <Link href="/admin/bot/paper" className="card hover:border-zinc-600"><div className="font-medium">Цаасан арилжаа</div><p className="mt-1 text-sm text-zinc-400">Сонгосон дүрмийг урагшаа, мөнгөгүйгээр шалгах.</p></Link>
      </div>
    </div>
  );
}
