"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { linkTelegramAction, testTelegramAction, unlinkTelegramAction, type TelegramState } from "@/lib/actions/telegram";
import { useT } from "./PrefsProvider";
import { TelegramConfirm } from "./TelegramConfirm";
import { usePoll } from "./usePoll";

/** After "Link Telegram", the page asks the server this often whether the chat is linked, for at most WAIT_MS. */
export const LINK_POLL_MS = 5000;
export const WAIT_MS = 3 * 60e3;

/** The pages that carry the whole card; everywhere else it is a one-line chip that links to Settings. */
const FULL_ON = ["/settings", "/bot"];

type Props = { configured: boolean; linked: boolean; isAdmin: boolean; paid?: boolean; pending?: { name: string } | null; variant?: "full" | "chip" };

/**
 * Where a user connects the Telegram bot so that active setups reach their phone. Hidden from users while the admin
 * has not set the bot up (only the admin sees the setup steps). Without a plan, linking still works (for /reset), and
 * the card says that signals come with a plan. In full only on Settings and the Robot page (or with variant="full");
 * elsewhere one line. While waiting for the user to press Start in Telegram, it checks for the link by itself.
 */
export function TelegramCard(props: Props) {
  const path = usePathname();
  const full = props.variant ? props.variant === "full" : !path || FULL_ON.some((p) => path === p || path.startsWith(`${p}/`));
  if (!props.configured && !props.isAdmin) return null;
  return full ? <TelegramFull {...props} /> : <TelegramChip linked={props.linked} configured={props.configured} />;
}

/** One line: linked or not, and the way to Settings. */
export function TelegramChip({ linked, configured }: { linked: boolean; configured: boolean }) {
  const t = useT();
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-2.5 text-sm" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }} data-testid="telegram-chip">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${linked ? "bg-emerald-400" : "bg-zinc-600"}`} />
      <span className="min-w-0 flex-1 text-zinc-300">
        {linked ? t("Telegram бот холбогдсон: дохио утсанд тань ирнэ.", "Telegram bot linked: signals reach your phone.") : configured ? t("Дохиог Telegram ботоор утсандаа аваарай.", "Get the signals on your phone through the Telegram bot.") : t("Telegram бот тохируулагдаагүй.", "The Telegram bot is not set up.")}
      </span>
      <Link href="/settings#telegram" className="font-semibold whitespace-nowrap text-amber-300 hover:text-amber-200">{linked ? t("Тохируулах", "Manage") : t("Холбох", "Link")} →</Link>
    </p>
  );
}

function TelegramFull({ configured, linked, isAdmin, paid = true, pending = null }: Props) {
  const t = useT();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [link, linkAction, linking] = useActionState<TelegramState, FormData>(linkTelegramAction, {});
  const [test, testAction, testing] = useActionState<TelegramState, FormData>(testTelegramAction, {});
  const [unlink, unlinkAction, unlinking] = useActionState<TelegramState, FormData>(unlinkTelegramAction, {});
  const note = link.error ?? test.error ?? unlink.error;
  const ok = test.ok ?? unlink.ok;

  // Waiting for Start in Telegram: refresh the server's view of this page every few seconds, for three minutes at most.
  // Rounds are counted per link, so a new link (or "check again") starts the three minutes over.
  const [rounds, setRounds] = useState({ link: "", n: 0 });
  const done = rounds.link === link.link ? rounds.n : 0;
  const expired = !!link.link && done * LINK_POLL_MS >= WAIT_MS;
  const waiting = !!link.link && !linked && !pending && !expired;
  usePoll(() => {
    setRounds((r) => ({ link: link.link ?? "", n: (r.link === link.link ? r.n : 0) + 1 }));
    startRefresh(() => router.refresh());
  }, LINK_POLL_MS, waiting, false);

  return (
    <section id="telegram" className="card scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold text-zinc-100">{t("Дохиог Telegram ботоор авах", "Get signals through the Telegram bot")}</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${linked ? "bg-emerald-500/15 text-emerald-400" : "border border-zinc-800 text-zinc-400"}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${linked ? "bg-emerald-400" : "bg-zinc-600"}`} />{linked ? t("Холбогдсон", "Linked") : t("Холбогдоогүй", "Not linked")}</span>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Setup “Идэвхтэй” болох мөчид орох, stop, target, биелсэн нөхцөл, дүрмийн түүхэн үр дүнг бичсэн мессеж утсанд чинь ирнэ. Систем 15 минутын лаа бүр хаагдсаны дараа шалгадаг. Арилжааг та өөрөө нээнэ, эсвэл робот нээнэ.", "The moment a setup becomes “Active”, a message with the entry, stop, target, the conditions met and the rule's historical record arrives on your phone. The system checks after every 15-minute candle closes. You open the trade yourself, or the robot does.")}</p>
      {!paid && <p className="mt-2 max-w-prose rounded-lg bg-amber-400/10 px-3 py-2 text-sm leading-relaxed text-amber-200">{t("Дохионууд багцтай хэрэглэгчдэд ирнэ. Одоо холбож болно: багц авмагц дохио ирж эхэлнэ, нууц үгээ мартвал Telegram ботод /reset илгээж сэргээнэ.", "Signals come with a plan. You can link now: they start arriving as soon as you have a plan, and if you forget your password you can send /reset to the Telegram bot.")}</p>}

      {!configured ? (
        isAdmin ? (
          <ol className="mt-4 max-w-prose list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:font-semibold marker:text-zinc-500">
            <li>{t("Telegram дээр ", "In Telegram open ")}<strong>@BotFather</strong>{t("-ийг нээж ", ", send ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/newbot</code>{t(" гэж бичээд Telegram бот үүсгэнэ. Төгсгөлд нь token өгнө.", " and create a Telegram bot. At the end it gives you a token.")}</li>
            <li>{t("Railway дээр ", "On Railway, under ")}<strong>xau-analytics → Variables</strong>{t(" хэсэгт ", ", add a variable named ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5 break-all">TELEGRAM_BOT_TOKEN</code>{t(" нэртэй хувьсагч нэмж token-оо утга болгон тавина.", " with the token as its value.")}</li>
            <li>{t("Railway дахин ачаалсны дараа энэ хуудсыг шинэчлэхэд “Telegram холбох” товч гарна.", "After Railway redeploys, refresh this page and the “Link Telegram” button appears.")}</li>
          </ol>
        ) : null
      ) : linked ? (
        <>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Telegram ботод бичих командууд: ", "Commands you can send the Telegram bot: ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/status</code>{t(" одоогийн чиглэл, дараагийн чухал мэдээ; ", " current bias and the next important release; ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/stop</code>{t(" дохиог түр зогсоох; ", " pause signals; ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5">/resume</code>{t(" дахин асаах.", " turn them back on.")}</p>
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
          {expired ? (
            <p className="text-sm leading-relaxed text-zinc-400">
              {t("Холболт хараахан ирсэнгүй. Start дарсан бол ", "No link yet. If you pressed Start, ")}
              <button type="button" className="font-semibold text-amber-300 underline underline-offset-4 hover:text-amber-200" onClick={() => setRounds({ link: link.link ?? "", n: 0 })}>{t("дахин шалгах", "check again")}</button>
              {t(". Холбоос 30 минут хүчинтэй.", ". The link works for 30 minutes.")}
            </p>
          ) : (
            <p role="status" className="flex items-center gap-2 text-sm leading-relaxed text-zinc-400">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400 motion-reduce:animate-none" />
              {t("Telegram ботод Start дарна. Холбогдмогц энэ хэсэг өөрөө шинэчлэгдэнэ. Холбоос 30 минут хүчинтэй.", "Press Start in the Telegram bot. This card updates by itself once linked. The link works for 30 minutes.")}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <form action={linkAction}><button className="btn" disabled={linking}>{linking ? t("Бэлдэж байна…", "Preparing…") : t("Telegram холбох", "Link Telegram")}</button></form>
          <p className="max-w-prose text-sm leading-relaxed text-zinc-400">{t("Эсвэл Telegram дээр манай Telegram ботыг нээж, бүртгэлтэй имэйлээ бичээд илгээ. Дараа нь энд гарч ирэх хүсэлт дээр “Тийм, минийх” гэж дарахад холбогдоно. Token, код оруулах шаардлагагүй.", "Or open our Telegram bot and send it the email you registered with. Then press “Yes, it's mine” on the request that appears here. No token or code to type.")}</p>
        </div>
      )}
      {note && <p role="alert" className="mt-3 text-sm text-red-400">{note}</p>}
      {ok && !note && <p role="status" className="mt-3 text-sm text-emerald-400">{ok}</p>}
    </section>
  );
}
