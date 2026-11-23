"use client";
import { useActionState } from "react";
import { linkTelegramAction, testTelegramAction, unlinkTelegramAction, type TelegramState } from "@/lib/actions/telegram";
import { useT } from "./PrefsProvider";

/** Where a user connects Telegram so that active setups reach their phone. */
export function TelegramCard({ configured, linked, isAdmin }: { configured: boolean; linked: boolean; isAdmin: boolean }) {
  const t = useT();
  const [link, linkAction, linking] = useActionState<TelegramState, FormData>(linkTelegramAction, {});
  const [test, testAction, testing] = useActionState<TelegramState, FormData>(testTelegramAction, {});
  const [unlink, unlinkAction, unlinking] = useActionState<TelegramState, FormData>(unlinkTelegramAction, {});
  const note = link.error ?? test.error ?? unlink.error;
  const ok = test.ok ?? unlink.ok;
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold text-zinc-100">{t("Дохиог Telegram-аар авах", "Get signals on Telegram")}</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${linked ? "bg-emerald-500/15 text-emerald-400" : "border border-zinc-800 text-zinc-400"}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${linked ? "bg-emerald-400" : "bg-zinc-600"}`} />{linked ? t("Холбогдсон", "Linked") : t("Холбогдоогүй", "Not linked")}</span>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Setup “Идэвхтэй” болох мөчид орох, stop, target, биелсэн нөхцөл, дүрмийн түүхэн үр дүнг бичсэн мессеж утсанд чинь ирнэ. Систем 5 минут тутам шалгадаг. Арилжааг та өөрөө нээнэ.", "The moment a setup becomes “Active”, a message with the entry, stop, target, the conditions met and the rule's historical record arrives on your phone. The system checks every 5 minutes. You open the trade yourself.")}</p>

      {!configured ? (
        isAdmin ? (
          <ol className="mt-4 max-w-prose list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:font-semibold marker:text-zinc-500">
            <li>{t("Telegram дээр ", "In Telegram open ")}<strong>@BotFather</strong>{t("-ийг нээж ", ", send ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/newbot</code>{t(" гэж бичээд бот үүсгэнэ. Төгсгөлд нь токен өгнө.", " and create a bot. At the end it gives you a token.")}</li>
            <li>{t("Railway дээр ", "On Railway, under ")}<strong>xau-analytics → Variables</strong>{t(" хэсэгт ", ", add a variable named ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5 break-all">TELEGRAM_BOT_TOKEN</code>{t(" нэртэй хувьсагч нэмж токеноо утга болгон тавина.", " with the token as its value.")}</li>
            <li>{t("Railway дахин ачаалсны дараа энэ хуудсыг шинэчлэхэд “Telegram холбох” товч гарна.", "After Railway redeploys, refresh this page and the “Link Telegram” button appears.")}</li>
          </ol>
        ) : <p className="mt-3 text-sm text-zinc-500">{t("Админ Telegram ботыг хараахан тохируулаагүй байна.", "The admin has not set up the Telegram bot yet.")}</p>
      ) : linked ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={testAction}><button className="btn-ghost" disabled={testing}>{t("Туршилтын мессеж илгээх", "Send a test message")}</button></form>
          <form action={unlinkAction}><button className="btn-ghost text-red-300" disabled={unlinking}>{t("Салгах", "Unlink")}</button></form>
        </div>
      ) : link.link ? (
        <div className="mt-4 space-y-2">
          <a className="btn" href={link.link} target="_blank" rel="noreferrer">{t("Telegram нээж Start дарах", "Open Telegram and press Start")}</a>
          <p className="text-xs leading-relaxed text-zinc-400">{t("Telegram дээр бот нээгдэхэд ", "When the bot opens in Telegram, press ")}<strong>Start</strong>{t(" дарна. “Холбогдлоо” гэсэн хариу ирсний дараа энэ хуудсаа шинэчлээрэй.", ". After the “Linked” reply arrives, refresh this page.")}</p>
        </div>
      ) : (
        <form action={linkAction} className="mt-4"><button className="btn" disabled={linking}>{linking ? t("Бэлдэж байна…", "Preparing…") : t("Telegram холбох", "Link Telegram")}</button></form>
      )}
      {note && <p role="alert" className="mt-3 text-sm text-red-400">{note}</p>}
      {ok && !note && <p role="status" className="mt-3 text-sm text-emerald-400">{ok}</p>}
    </section>
  );
}
