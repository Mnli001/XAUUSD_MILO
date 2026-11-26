import Link from "next/link";
import type { T } from "@/lib/i18n";

export type AdminContact = { text: string; url: string | null };

/**
 * How a newcomer reaches the admin, from the ADMIN_CONTACT (any text: a phone, a Telegram name) and
 * ADMIN_CONTACT_URL (a t.me or m.me link) settings. Only http(s) links are kept, so a bad value can never run script.
 */
export function adminContact(env: { ADMIN_CONTACT?: string; ADMIN_CONTACT_URL?: string }): AdminContact | null {
  const text = env.ADMIN_CONTACT?.trim() ?? "";
  const raw = env.ADMIN_CONTACT_URL?.trim() ?? "";
  const url = /^https?:\/\//i.test(raw) ? raw : null;
  if (!text && !url) return null;
  return { text: text || (url as string), url };
}

/** What a newly registered person sees until the admin opens their access: that it worked, what happens next, who to ask. */
export function LockedCard({ t, email, contact, signOut }: { t: T; email: string; contact: AdminContact | null; signOut: () => Promise<void> }) {
  return (
    <div className="card w-full max-w-md space-y-5 sm:p-7">
      <div className="space-y-3 text-center">
        <span aria-hidden className="mx-auto block h-[13px] w-[13px] rounded-full border-[3px] border-amber-400" />
        <h1 className="page-title">{t("Эрх нээгдэхийг хүлээж байна", "Waiting for access")}</h1>
        <p className="text-zinc-300">{t("Бүртгэл амжилттай үүссэн:", "Your account is created:")} <strong className="font-semibold break-words text-zinc-50">{email}</strong></p>
      </div>

      <ol className="space-y-2.5 text-sm text-zinc-300">
        {[
          contact ? t("Доорх хаягаар админд бүртгүүлсэн имэйлээ хэлнэ.", "Tell the admin your registered email, using the contact below.") : t("Админд бүртгүүлсэн имэйлээ хэлнэ.", "Tell the admin your registered email."),
          t("Админ таны эрхийг нээнэ.", "The admin opens your access."),
          t("“Дахин шалгах” дээр дарахад систем шууд нээгдэнэ. Дахин нэвтрэх шаардлагагүй.", "Press “Check again” and the system opens. No need to sign in again."),
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-400/40 text-xs font-semibold text-amber-300 tabular-nums">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      {contact && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-center">
          <p className="text-xs text-amber-200/80">{t("Админтай холбогдох", "Contact the admin")}</p>
          <p className="mt-1 font-semibold break-words text-amber-200">{contact.text}</p>
          {contact.url && (
            <a href={contact.url} target="_blank" rel="noopener noreferrer" className="btn mt-3 w-full">{t("Админд бичих", "Write to the admin")}</a>
          )}
        </div>
      )}

      <p className="text-sm leading-relaxed text-zinc-400">
        {t("Эрх нээгдсэний дараа: өнөөдрийн давамгай чиглэл, цаг тутмын магадлал, орох setup, чухал мэдээний хуваарь, арилжааны журнал, MT5 бот.", "Once open: today's leading side, hour-by-hour odds, entry setups, the important news calendar, a trade journal and the MT5 bot.")}
      </p>

      <div className="flex flex-wrap gap-3">
        <Link href="/today" className="btn flex-1">{t("Дахин шалгах", "Check again")}</Link>
        <form action={signOut} className="flex-1"><button className="btn-ghost w-full">{t("Гарах", "Sign out")}</button></form>
      </div>
    </div>
  );
}
