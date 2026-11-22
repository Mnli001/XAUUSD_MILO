"use client";
import { useActionState } from "react";
import { linkTelegramAction, testTelegramAction, unlinkTelegramAction, type TelegramState } from "@/lib/actions/telegram";

/** Where a user connects Telegram so that active setups reach their phone. */
export function TelegramCard({ configured, linked, isAdmin }: { configured: boolean; linked: boolean; isAdmin: boolean }) {
  const [link, linkAction, linking] = useActionState<TelegramState, FormData>(linkTelegramAction, {});
  const [test, testAction, testing] = useActionState<TelegramState, FormData>(testTelegramAction, {});
  const [unlink, unlinkAction, unlinking] = useActionState<TelegramState, FormData>(unlinkTelegramAction, {});
  const note = link.error ?? test.error ?? unlink.error;
  const ok = test.ok ?? unlink.ok;
  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-zinc-50">Дохиог Telegram-аар авах</h2>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${linked ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-400" : "border-zinc-700 text-zinc-400"}`}>{linked ? "Холбогдсон" : "Холбогдоогүй"}</span>
      </div>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-zinc-300">Setup “Идэвхтэй” болох мөчид орох, stop, target, биелсэн нөхцөл, дүрмийн түүхэн үр дүнг бичсэн мессеж утсанд чинь ирнэ. Систем 5 минут тутам шалгадаг. Арилжааг та өөрөө нээнэ.</p>

      {!configured ? (
        isAdmin ? (
          <ol className="mt-3 max-w-prose list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
            <li>Telegram дээр <strong>@BotFather</strong>-ийг нээж <code className="rounded bg-zinc-800 px-1.5 py-0.5">/newbot</code> гэж бичээд бот үүсгэнэ. Төгсгөлд нь токен өгнө.</li>
            <li>Railway дээр <strong>xau-analytics → Variables</strong> хэсэгт <code className="rounded bg-zinc-800 px-1.5 py-0.5 break-all">TELEGRAM_BOT_TOKEN</code> нэртэй хувьсагч нэмж токеноо утга болгон тавина.</li>
            <li>Railway дахин ачаалсны дараа энэ хуудсыг шинэчлэхэд “Telegram холбох” товч гарна.</li>
          </ol>
        ) : <p className="mt-3 text-sm text-zinc-500">Админ Telegram ботыг хараахан тохируулаагүй байна.</p>
      ) : linked ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={testAction}><button className="btn-ghost" disabled={testing}>Туршилтын мессеж илгээх</button></form>
          <form action={unlinkAction}><button className="btn-ghost text-red-300" disabled={unlinking}>Салгах</button></form>
        </div>
      ) : link.link ? (
        <div className="mt-4 space-y-2">
          <a className="btn" href={link.link} target="_blank" rel="noreferrer">Telegram нээж Start дарах</a>
          <p className="text-xs leading-relaxed text-zinc-400">Telegram дээр бот нээгдэхэд <strong>Start</strong> дарна. “Холбогдлоо” гэсэн хариу ирсний дараа энэ хуудсаа шинэчлээрэй.</p>
        </div>
      ) : (
        <form action={linkAction} className="mt-4"><button className="btn" disabled={linking}>{linking ? "Бэлдэж байна…" : "Telegram холбох"}</button></form>
      )}
      {note && <p role="alert" className="mt-3 text-sm text-red-400">{note}</p>}
      {ok && !note && <p role="status" className="mt-3 text-sm text-emerald-400">{ok}</p>}
    </section>
  );
}
