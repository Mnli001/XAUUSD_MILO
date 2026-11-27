import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { paymentsOf } from "@/lib/payments";
import { PLANS, isPlanId, tugrik } from "@/lib/plans";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { InviteCard } from "@/components/InviteCard";
import { referralCodeFor, referralStats, REFERRAL_DAYS } from "@/lib/referral";
import { siteUrl } from "@/lib/telegram";
import { BacktestNote, ProofLine, RiskLadder } from "@/components/BacktestFacts";
import { PlanFeatureList } from "@/components/PlanFeatures";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Багц", "Plans") };
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ pay?: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const now = new Date();
  const { paid, payOn, contact } = paywallFor(user, now);
  const { pay } = await searchParams;
  const [mine, code, stats] = await Promise.all([paymentsOf(user.id, 6), referralCodeFor(user.id), referralStats(user.id)]);
  const site = siteUrl();
  const until = user.role !== "ADMIN" && paid && user.accessUntil ? v.date(user.accessUntil) : null;
  const statusWord = (s: string, expired: boolean) =>
    s === "PAID" ? t("Төлөгдсөн", "Paid") : s === "REFUNDED" ? t("Буцаагдсан", "Refunded") : s === "EXPIRED" || expired ? t("Хугацаа дууссан", "Expired") : t("Төлбөр хүлээгдэж байна", "Awaiting payment");
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="page-title">{t("Багц", "Plans")}</h1>
        <p className="page-lede">{t("Багц авмагц өсөх/унах магадлал, давамгай тал, setup-ийн орох цэг, bot бүгд нээгдэнэ. Төлбөр баталгаажмагц шууд идэвхжинэ.", "A plan opens the odds, the leading side, setup entries and the bot. It turns on the moment the payment is confirmed.")}</p>
      </div>
      {pay === "error" && <p role="alert" className="card border-red-400/40 text-sm text-red-300">{t("Төлбөрийн системтэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.", "Could not reach the payment system. Please wait a moment and try again.")}</p>}
      {pay === "off" && <p role="alert" className="card text-sm text-zinc-300">{t("Онлайн төлбөр хараахан тохируулагдаагүй байна.", "Online payments are not set up yet.")}</p>}
      {user.role === "ADMIN" && <p className="text-sm text-zinc-400">{t("Та админ тул бүх зүйл хугацаагүй нээлттэй. Туршихын тулд багц сонгож болно.", "As an admin everything is open with no end date. You can still choose a plan to test.")}</p>}
      {/* The proof first: what the system did on the broker's history, at every risk. */}
      <section className="hallmark space-y-4 p-5 sm:p-6" aria-label={t("Системийн түүхэн үр дүн", "The system's historical result")}>
        <ProofLine t={t} size="sm" />
        <RiskLadder t={t} />
        <BacktestNote t={t} />
      </section>
      <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} until={until} />
      <section className="card" aria-labelledby="features-h">
        <h2 id="features-h" className="card-title">{t("Багц бүрт багтсан зүйлс (Plus, Pro, Max ижил, хугацаа л өөр)", "In every plan (Plus, Pro and Max are the same; only the length differs)")}</h2>
        <PlanFeatureList t={t} links={paid} />
      </section>
      {site && <InviteCard link={`${site}/register?ref=${code}`} days={REFERRAL_DAYS} stats={stats} />}
      {mine.length > 0 && (
        <section className="table-card" aria-labelledby="mine-h">
          <h2 id="mine-h" className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{t("Таны төлбөрүүд", "Your payments")}</h2>
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {mine.map((p) => {
              const expired = p.status === "PENDING" && p.expiresAt <= now;
              const open = p.status === "PENDING" && !expired;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5" style={{ borderColor: "var(--hairline)" }}>
                  <span className="text-zinc-400 tabular-nums">{v.dateTime(p.createdAt)}</span>
                  <span className="font-semibold text-zinc-100">{isPlanId(p.plan) ? PLANS[p.plan].name : p.plan}</span>
                  <span className="text-zinc-300 tabular-nums">{tugrik(p.amount)}</span>
                  <span className={p.status === "PAID" ? "text-emerald-400" : open ? "text-amber-300" : "text-zinc-500"}>{statusWord(p.status, expired)}</span>
                  {open && <Link href={`/pay/${p.id}`} className="ml-auto font-semibold text-amber-300 hover:text-amber-200">{t("Төлөх", "Pay")} →</Link>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
