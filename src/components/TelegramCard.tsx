"use client";
import { useActionState } from "react";
import { linkTelegramAction, testTelegramAction, unlinkTelegramAction, type TelegramState } from "@/lib/actions/telegram";
import { useT } from "./PrefsProvider";
import { TelegramConfirm } from "./TelegramConfirm";

/**
 * Where a user connects Telegram so that active setups reach their phone. Hidden from users while the admin has
 * not set the bot up (only the admin sees the setup steps). Without a plan, linking still works (for /reset), and
 * the card says that signals come with a plan.
 */
export function TelegramCard({ configured, linked, isAdmin, paid = true, pending = null }: { configured: boolean; linked: boolean; isAdmin: boolean; paid?: boolean; pending?: { name: string } | null }) {
  const t = useT();
  const [link, linkAction, linking] = useActionState<TelegramState, FormData>(linkTelegramAction, {});
  const [test, testAction, testing] = useActionState<TelegramState, FormData>(testTelegramAction, {});
  const [unlink, unlinkAction, unlinking] = useActionState<TelegramState, FormData>(unlinkTelegramAction, {});
  const note = link.error ?? test.error ?? unlink.error;
  const ok = test.ok ?? unlink.ok;
  if (!configured && !isAdmin) return null;
  return (
    <section id="telegram" className="card scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold text-zinc-100">{t("Дохиог Telegram-аар авах", "Get signals on Telegram")}</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${linked ? "bg-emerald-500/15 text-emerald-400" : "border border-zinc-800 text-zinc-400"}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${linked ? "bg-emerald-400" : "bg-zinc-600"}`} />{linked ? t("Холбогдсон", "Linked") : t("Холбогдоогүй", "Not linked")}</span>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Setup “Идэвхтэй” болох мөчид орох, stop, target, биелсэн нөхцөл, дүрмийн түүхэн үр дүнг бичсэн мессеж утсанд чинь ирнэ. Систем 5 минут тутам шалгадаг. Арилжааг та өөрөө нээнэ.", "The moment a setup becomes “Active”, a message with the entry, stop, target, the conditions met and the rule's historical record arrives on your phone. The system checks every 5 minutes. You open the trade yourself.")}</p>
      {!paid && <p className="mt-2 max-w-prose rounded-lg bg-amber-400/10 px-3 py-2 text-sm leading-relaxed text-amber-200">{t("Дохионууд багцтай хэрэглэгчдэд ирнэ. Одоо холбож болно: багц авмагц дохио ирж эхэлнэ, нууц үгээ мартвал bot-од /reset илгээж сэргээнэ.", "Signals come with a plan. You can link now: they start arriving as soon as you have a plan, and if you forget your password you can send /reset to the bot.")}</p>}

      {!configured ? (
        isAdmin ? (
          <ol className="mt-4 max-w-prose list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:font-semibold marker:text-zinc-500">
            <li>{t("Telegram дээр ", "In Telegram open ")}<strong>@BotFather</strong>{t("-ийг нээж ", ", send ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/newbot</code>{t(" гэж бичээд bot үүсгэнэ. Төгсгөлд нь token өгнө.", " and create a bot. At the end it gives you a token.")}</li>
            <li>{t("Railway дээр ", "On Railway, under ")}<strong>xau-analytics → Variables</strong>{t(" хэсэгт ", ", add a variable named ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5 break-all">TELEGRAM_BOT_TOKEN</code>{t(" нэртэй хувьсагч нэмж token-оо утга болгон тавина.", " with the token as its value.")}</li>
            <li>{t("Railway дахин ачаалсны дараа энэ хуудсыг шинэчлэхэд “Telegram холбох” товч гарна.", "After Railway redeploys, refresh this page and the “Link Telegram” button appears.")}</li>
          </ol>
        ) : null
      ) : linked ? (
        <>
          <p className="mt-3 max-w-prose text-xs leading-relaxed text-zinc-400">{t("Bot-од бичих командууд: ", "Commands you can send the bot: ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/status</code>{t(" одоогийн чиглэл, дараагийн чухал мэдээ; ", " current bias and the next important release; ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/stop</code>{t(" дохиог түр зогсоох; ", " pause signals; ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/resume</code>{t(" дахин асаах.", " turn them back on.")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={testAction}><button className="btn-ghost" disabled={testing}>{t("Туршилтын мессеж илгээх", "Send a test message")}</button></form>
            <form action={unlinkAction}><button className="btn-ghost text-red-300" disabled={unlinking}>{t("Салгах", "Unlink")}</button></form>
          </div>
        </>
      ) : pending ? (
        <TelegramConfirm name={pending.name} />
      ) : link.link ? (
        <div className="mt-4 space-y-2">
          <a className="btn" href={link.link} target="_blank" rel="noreferrer">{t("Telegram нээж Start дарах", "Open Telegram and press Start")}</a>
          <p className="text-xs leading-relaxed text-zinc-400">{t("Telegram дээр bot нээгдэхэд ", "When the bot opens in Telegram, press ")}<strong>Start</strong>{t(" дарна. “Холбогдлоо” гэсэн хариу ирсний дараа энэ хуудсаа шинэчлээрэй.", ". After the “Linked” reply arrives, refresh this page.")}{t(" Холбоос 30 минут хүчинтэй.", " The link works for 30 minutes.")}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <form action={linkAction}><button className="btn" disabled={linking}>{linking ? t("Бэлдэж байна…", "Preparing…") : t("Telegram холбох", "Link Telegram")}</button></form>
          <p className="max-w-prose text-xs leading-relaxed text-zinc-400">{t("Эсвэл Telegram дээр манай bot-ыг нээж, бүртгэлтэй имэйлээ бичээд илгээ. Дараа нь энд гарч ирэх хүсэлт дээр “Тийм, минийх” гэж дарахад холбогдоно. Token, код оруулах шаардлагагүй.", "Or open our bot in Telegram and send it the email you registered with. Then press “Yes, it's mine” on the request that appears here. No token or code to type.")}</p>
        </div>
      )}
      {note && <p role="alert" className="mt-3 text-sm text-red-400">{note}</p>}
      {ok && !note && <p role="status" className="mt-3 text-sm text-emerald-400">{ok}</p>}
    </section>
  );
}
