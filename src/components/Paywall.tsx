import Link from "next/link";
import type { T } from "@/lib/i18n";
import type { AdminContact } from "@/lib/contact";
import { PLANS, PLAN_IDS, tugrik, type PlanId } from "@/lib/plans";

/** A hidden number. The real value never reaches the page; a screen reader hears why it is hidden. */
export function Masked({ t, className = "" }: { t: T; className?: string }) {
  return (
    <span className={`font-mono tracking-[0.18em] text-zinc-500 select-none ${className}`}>
      <span aria-hidden>*****</span><span className="sr-only">{t("багцтай хэрэглэгчдэд нээгдэнэ", "opens with a plan")}</span>
    </span>
  );
}

/** A small link to the plans, under a locked card. */
export function UnlockLink({ t }: { t: T }) {
  return (
    <Link href="/plans" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl text-sm font-semibold text-amber-300 hover:text-amber-200">
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z" clipRule="evenodd" /></svg>
      {t("Багц сонгож нээх", "Choose a plan to open")}
    </Link>
  );
}

const period = (id: PlanId, t: T) => ({ PLUS: t("1 сар", "1 month"), PRO: t("6 сар", "6 months"), MAX: t("1 жил", "1 year") })[id];
const months: Record<PlanId, number> = { PLUS: 1, PRO: 6, MAX: 12 };

/**
 * The three plans side by side, each a form that posts its plan id. `payOn` is false until the Wire settings are
 * entered: the plans still show, the buttons wait, and the admin's contact is given instead.
 */
export function PlansCard({ t, choose, payOn, contact, until, compact = false }: {
  t: T; choose: (form: FormData) => Promise<void>; payOn: boolean; contact: AdminContact | null; until?: string | null; compact?: boolean;
}) {
  const base = PLANS.PLUS.amount;
  return (
    <section className="card border-amber-400/25" aria-labelledby="plans-h">
      <h2 id="plans-h" className="card-title">{until ? t("Багцаа сунгах", "Renew your plan") : t("Бүх тоог нээх багц", "A plan opens every number")}</h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-400">
        {until
          ? t(`Таны эрх ${until} хүртэл. Одоо сунгавал үлдсэн хоног тань хасагдахгүй, дээр нь нэмэгдэнэ.`, `Your access runs until ${until}. Renew now and the days left are kept, the new ones added on top.`)
          : t("Өсөх/унах магадлал, давамгай тал, setup-ийн орох цэг, бот — төлмөгц шууд нээгдэнэ.", "Rise/fall odds, the leading side, setup entries and the bot open the moment you pay.")}
      </p>
      <ul className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-3" : "md:grid-cols-3"}`}>
        {PLAN_IDS.map((id) => {
          const p = PLANS[id];
          const perMonth = Math.round(p.amount / months[id]);
          const saving = Math.round((1 - perMonth / base) * 100);
          return (
            <li key={id} className={`flex flex-col rounded-2xl border p-4 ${id === "PRO" ? "border-amber-400/40 bg-amber-400/[0.06]" : ""}`} style={id === "PRO" ? undefined : { borderColor: "var(--hairline)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-2xl text-zinc-50">{p.name}</h3>
                <span className="text-sm text-zinc-400">{period(id, t)}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-amber-300 tabular-nums">{tugrik(p.amount)}</p>
              <p className="mt-0.5 min-h-5 text-xs text-zinc-500 tabular-nums">
                {months[id] > 1 ? t(`сард ${tugrik(perMonth)} · ${saving}% хэмнэлт`, `${tugrik(perMonth)} a month · ${saving}% less`) : t(`${p.days} хоног`, `${p.days} days`)}
              </p>
              <form action={choose} className="mt-4">
                <input type="hidden" name="plan" value={id} />
                <button className={`${id === "PRO" ? "btn" : "btn-ghost"} w-full`} disabled={!payOn}>{t(`${p.name} сонгох`, `Choose ${p.name}`)}</button>
              </form>
            </li>
          );
        })}
      </ul>
      {!payOn && (
        <div className="mt-4 rounded-2xl border border-zinc-700/60 p-4 text-sm text-zinc-300">
          <p>{t("Онлайн төлбөр удахгүй нээгдэнэ.", "Online payment opens soon.")}{contact ? ` ${t("Одоо авах бол админд хандаарай:", "To buy now, contact the admin:")}` : ""}</p>
          {contact && <p className="mt-1 font-semibold text-amber-200">{contact.url ? <a href={contact.url} target="_blank" rel="noopener noreferrer" className="underline decoration-amber-400/50 underline-offset-4">{contact.text}</a> : contact.text}</p>}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">{t("Төлбөр Wire-аар: QPay, банкны апп, карт, Toki. Түүхэн статистикт суурилсан мэдээлэл, санхүүгийн зөвлөгөө биш.", "Paid through Wire: QPay, bank apps, cards, Toki. Information based on historical statistics, not financial advice.")}</p>
    </section>
  );
}
