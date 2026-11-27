"use client";
import { useActionState } from "react";
import { confirmTelegramAction, rejectTelegramAction, type TelegramState } from "@/lib/actions/telegram";
import { useT } from "./PrefsProvider";

/**
 * Someone gave this account's email to the Telegram bot. The owner says here whether that was them;
 * only a yes links the chat. Shown on every signed-in page while a request is waiting.
 */
export function TelegramConfirm({ name, banner = false }: { name: string; banner?: boolean }) {
  const t = useT();
  const [yes, yesAction, confirming] = useActionState<TelegramState, FormData>(confirmTelegramAction, {});
  const [no, noAction, rejecting] = useActionState<TelegramState, FormData>(rejectTelegramAction, {});
  const note = yes.error ?? no.error;
  return (
    <div role="status" className={banner ? "glass-banner mb-4 sm:mb-6" : "glass-inset mt-4 p-4"}>
      <p className="text-sm font-semibold text-zinc-100">{t("Telegram холбох хүсэлт ирлээ", "A request to link Telegram")}</p>
      <p className="mt-1 max-w-prose text-sm leading-relaxed break-words text-zinc-400">
        <strong className="text-zinc-200">{name}</strong>{t(" гэсэн Telegram хаягаас таны имэйлийг bot-од бичсэн байна. Энэ та мөн бол баталгаажуулна уу. Та биш бол татгалзаарай: тэр хүнд юу ч илгээгдэхгүй.", " wrote your email to the bot on Telegram. If that was you, confirm. If not, decline: nothing is sent to them.")}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <form action={yesAction}><button className="btn" disabled={confirming || rejecting}>{confirming ? t("Холбож байна…", "Linking…") : t("Тийм, минийх", "Yes, it's mine")}</button></form>
        <form action={noAction}><button className="btn-ghost" disabled={confirming || rejecting}>{t("Үгүй, би биш", "No, not me")}</button></form>
      </div>
      {note && <p role="alert" className="mt-3 text-sm text-red-400">{note}</p>}
    </div>
  );
}
