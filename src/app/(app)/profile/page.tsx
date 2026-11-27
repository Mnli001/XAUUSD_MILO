import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { avatarUrl } from "@/lib/avatar";
import { botSummary, latestPaidPlan, planSummary, tradeSummary, type PlanSummary } from "@/lib/dashboard";
import { botTrades } from "@/lib/botPerformance";
import { listAccounts } from "@/lib/bot/liveDb";
import { paymentsOf } from "@/lib/payments";
import { PLANS, isPlanId, tugrik } from "@/lib/plans";
import { referralCodeFor, referralStats, REFERRAL_DAYS } from "@/lib/referral";
import { siteUrl } from "@/lib/telegram";
import { listTrades } from "@/lib/trades";
import { logoutAction } from "@/lib/actions/session";
import { AvatarUploader } from "@/components/AvatarUploader";
import { ProfileForm } from "@/components/SettingsForms";
import { InviteCard } from "@/components/InviteCard";
import { Pnl } from "@/components/Timetable";
import { Icon } from "@/components/TodayIcons";
import type { Viewer } from "@/lib/viewer";
import { LOCALE_NAMES } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Profile — XAU Analytics", "Profile — XAU Analytics") };
}

const DAY = 864e5;

/** The plan as one short line: "Pro · 23 days left", "Admin", "No plan". */
function planLine(p: PlanSummary, v: Viewer): string {
  const { t } = v;
  if (p.kind === "admin") return t("Админ · бүх эрх", "Admin · full access");
  if (p.kind === "active") return `${p.plan ? PLANS[p.plan].name : t("Идэвхтэй", "Active")} · ${t(`${p.daysLeft} хоног үлдсэн`, `${p.daysLeft} days left`)}`;
  if (p.kind === "expired") return t(`${v.date(p.until)}-нд дууссан`, `Ended ${v.date(p.until)}`);
  return t("Багц алга", "No plan");
}

function Tile({ icon, label, children, note, href }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; children: ReactNode; note?: ReactNode; href: string }) {
  return (
    <Link href={href} className="glass-tile flex min-w-0 flex-col gap-1 p-4 hover:border-[var(--hairline-gold)]">
      <span className="flex items-center gap-2 text-xs text-zinc-500"><Icon name={icon} className="h-4 w-4 text-amber-400" />{label}</span>
      <span className="text-lg leading-tight font-semibold text-zinc-50 tabular-nums">{children}</span>
      {note && <span className="text-xs text-zinc-500">{note}</span>}
    </Link>
  );
}

function CardTitle({ icon, children, id }: { icon: Parameters<typeof Icon>[0]["name"]; children: ReactNode; id: string }) {
  return <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-zinc-100"><Icon name={icon} className="h-[18px] w-[18px] text-amber-400" />{children}</h2>;
}

/**
 * Everything about the signed-in user in one place: the picture and name, the plan and its payments, the robot's
 * accounts and results, invites, Telegram, and the privacy record. Preferences stay on the Settings page.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const [avatar, paidPlan, pays, code, stats, accounts, bot, journal] = await Promise.all([
    avatarUrl(user.id), latestPaidPlan(user.id), paymentsOf(user.id, 6), referralCodeFor(user.id), referralStats(user.id),
    listAccounts(user.id, now), botSummary(user.id, now), listTrades(user.id),
  ]);
  const closed = bot.account ? await botTrades(user.id, bot.account) : [];
  const month = tradeSummary(closed, bot.positions, now);
  const plan = planSummary(user, paidPlan, now);
  const site = siteUrl();
  const running = accounts.filter((a) => a.state === "RUNNING").length;
  const planDays = plan.kind === "active" && plan.plan ? PLANS[plan.plan].days : null;
  const used = plan.kind === "active" && planDays ? Math.min(100, Math.max(4, Math.round((plan.daysLeft / planDays) * 100))) : null;
  const memberDays = Math.max(1, Math.floor((now.getTime() - user.createdAt.getTime()) / DAY));
  const access = user.role === "ADMIN" ? t("хугацаагүй (админ)", "no expiry (admin)") : user.accessUntil ? t(`${v.dateTime(user.accessUntil)} хүртэл (${v.zone})`, `until ${v.dateTime(user.accessUntil)} (${v.zone})`) : "—";
  const langName = LOCALE_NAMES[v.locale];
  const statusWord = (s: string, expired: boolean) => (s === "PAID" ? t("Төлөгдсөн", "Paid") : s === "EXPIRED" || expired ? t("Хугацаа дууссан", "Expired") : t("Хүлээгдэж байна", "Awaiting payment"));

  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <section className="card relative overflow-hidden p-6 sm:p-8" aria-labelledby="me-h"
        style={{ background: "radial-gradient(70% 130% at 0% 0%, rgb(217 181 102 / 0.16), transparent 60%), radial-gradient(50% 120% at 100% 100%, rgb(143 180 230 / 0.08), transparent 60%), var(--panel-bg)" }}>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <AvatarUploader name={user.name} src={avatar} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-medium text-amber-400">{t("Profile", "Profile")}</p>
            <h1 id="me-h" className="font-display mt-1 text-[30px] leading-tight break-words text-zinc-50 sm:text-[40px]">{user.name}</h1>
            <p className="mt-1 text-sm break-all text-zinc-400">{user.email}</p>
            <p className="mt-3 flex flex-wrap justify-center gap-2 text-xs sm:justify-start">
              <span className="rounded-full bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-300">{planLine(plan, v)}</span>
              {user.role === "ADMIN" && <span className="rounded-full bg-red-500/15 px-2.5 py-1 font-semibold text-red-300">{t("Админ", "Admin")}</span>}
              <span className="rounded-full px-2.5 py-1 text-zinc-400" style={{ background: "var(--glass-inset)" }}>{t(`${v.date(user.createdAt)}-нээс гишүүн · ${memberDays} хоног`, `Member since ${v.date(user.createdAt)} · ${memberDays} days`)}</span>
              <span className={`rounded-full px-2.5 py-1 ${user.telegramChatId ? "bg-emerald-500/15 text-emerald-400" : "text-zinc-500"}`} style={user.telegramChatId ? undefined : { background: "var(--glass-inset)" }}>Telegram {user.telegramChatId ? t("холбогдсон", "linked") : t("холбоогүй", "not linked")}</span>
            </p>
          </div>
          <div className="flex gap-2 sm:flex-col">
            <Link href="/settings" className="btn-ghost">{t("Тохиргоо", "Settings")}</Link>
            <form action={logoutAction}><button className="btn-ghost w-full text-zinc-400">{t("Гарах", "Sign out")}</button></form>
          </div>
        </div>
      </section>

      <nav aria-label={t("Товч мэдээлэл", "At a glance")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon="wallet" label={t("Багц", "Plan")} href="/plans" note={plan.kind === "active" ? t(`${v.date(plan.until)} хүртэл`, `until ${v.date(plan.until)}`) : plan.kind === "admin" ? t("хугацаагүй", "no end date") : t("Багц сонгох", "Choose a plan")}>
          {plan.kind === "active" ? (plan.plan ? PLANS[plan.plan].name : t("Идэвхтэй", "Active")) : plan.kind === "admin" ? t("Админ", "Admin") : t("Алга", "None")}
        </Tile>
        <Tile icon="chart" label={t("Роботын 30 хоног", "Robot · 30 days")} href="/performance" note={month.month.closed > 0 ? t(`${month.month.closed} арилжаа${month.month.winRate !== null ? ` · ${month.month.winRate}% ашигтай` : ""}`, `${month.month.closed} trades${month.month.winRate !== null ? ` · ${month.month.winRate}% won` : ""}`) : t("Арилжаа хараахан алга", "No trades yet")}>
          {month.month.closed > 0 ? <Pnl value={month.month.pnl} /> : "—"}
        </Tile>
        <Tile icon="bot" label={t("MT5 данс", "MT5 accounts")} href="/bot" note={accounts.length ? t(`${running} нь ажиллаж байна`, `${running} running`) : t("Холбогдоогүй", "Not connected")}>
          {accounts.length}
        </Tile>
        <Tile icon="link" label={t("Урьсан найз", "Friends invited")} href="#invite" note={t(`${stats.paid} нь багц авсан · +${stats.daysEarned} хоног`, `${stats.paid} bought a plan · +${stats.daysEarned} days`)}>
          {stats.invited}
        </Tile>
      </nav>

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
        <ProfileForm name={user.name} email={user.email} access={access} />

        <section className="card" aria-labelledby="plan-h">
          <CardTitle icon="wallet" id="plan-h">{t("Багц ба төлбөр", "Plan and payments")}</CardTitle>
          <p className="mt-3 text-sm text-zinc-300">{planLine(plan, v)}</p>
          {used !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--glass-inset)" }} role="img" aria-label={t(`Багцын ${used}% үлдсэн`, `${used}% of the plan left`)}>
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${used}%` }} />
            </div>
          )}
          <Link href="/plans" className="btn mt-4">{plan.kind === "active" || plan.kind === "expired" ? t("Багц сунгах", "Renew plan") : plan.kind === "admin" ? t("Багцууд", "Plans") : t("Багц сонгох", "Choose a plan")}</Link>
          <h3 className="mt-5 text-sm font-semibold text-zinc-300">{t("Сүүлийн төлбөрүүд", "Recent payments")}</h3>
          {pays.length === 0 ? <p className="mt-2 text-sm text-zinc-500">{t("Төлбөр хийгээгүй байна.", "No payments yet.")}</p> : (
            <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--hairline)" }}>
              {pays.map((p) => {
                const expired = p.status === "PENDING" && p.expiresAt <= now;
                const open = p.status === "PENDING" && !expired;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                    <span className="text-zinc-500 tabular-nums">{v.date(p.createdAt)}</span>
                    <span className="font-semibold text-zinc-100">{isPlanId(p.plan) ? PLANS[p.plan].name : p.plan}</span>
                    <span className="text-zinc-300 tabular-nums">{tugrik(p.amount)}</span>
                    <span className={`ml-auto ${p.status === "PAID" ? "text-emerald-400" : open ? "text-amber-300" : "text-zinc-500"}`}>{statusWord(p.status, expired)}</span>
                    {open && <Link href={`/pay/${p.id}`} className="font-semibold text-amber-300 hover:text-amber-200">{t("Төлөх", "Pay")}</Link>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="links-h">
          <CardTitle icon="bot" id="links-h">{t("Холболтууд", "Connections")}</CardTitle>
          <ul className="mt-3 space-y-2.5">
            <li className="glass-tile flex items-center gap-3 px-3.5 py-3 text-sm">
              <span aria-hidden className={`h-2 w-2 rounded-full ${user.telegramChatId ? "bg-emerald-400" : "bg-zinc-600"}`} />
              <span className="min-w-0 flex-1"><span className="font-semibold text-zinc-100">Telegram</span><span className="block text-xs text-zinc-500">{user.telegramChatId ? (user.signalsPaused ? t("Холбогдсон · дохио түр зогссон", "Linked · signals paused") : t("Холбогдсон · setup дохио ирнэ", "Linked · setup signals on")) : t("Холбоогүй: setup дохиог утсандаа авахгүй байна", "Not linked: setup signals do not reach your phone")}</span></span>
              <Link href="/settings" className="text-xs font-semibold text-amber-300 hover:text-amber-200">{user.telegramChatId ? t("Тохируулах", "Manage") : t("Холбох", "Link")}</Link>
            </li>
            {accounts.length === 0 ? (
              <li className="glass-tile flex items-center gap-3 px-3.5 py-3 text-sm">
                <span aria-hidden className="h-2 w-2 rounded-full bg-zinc-600" />
                <span className="min-w-0 flex-1"><span className="font-semibold text-zinc-100">MT5</span><span className="block text-xs text-zinc-500">{t("Робот холбогдоогүй", "No robot connected")}</span></span>
                <Link href="/bot" className="text-xs font-semibold text-amber-300 hover:text-amber-200">{t("Холбох", "Connect")}</Link>
              </li>
            ) : accounts.map((a) => (
              <li key={a.login} className="glass-tile flex items-center gap-3 px-3.5 py-3 text-sm">
                <span aria-hidden className={`h-2 w-2 rounded-full ${a.online ? "bg-emerald-400" : "bg-zinc-600"}`} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-zinc-100 tabular-nums">{a.label}</span>
                  <span className="block text-xs text-zinc-500">{a.mode === "REAL" ? t("Жинхэнэ данс", "Real account") : a.mode === "DEMO" ? t("Demo данс", "Demo account") : "MT5"} · {a.state === "RUNNING" ? t("ажиллаж байна", "running") : t("зогссон", "stopped")} · {a.online ? t("холбогдсон", "connected") : t("холбогдоогүй", "offline")}</span>
                </span>
                <Link href={`/bot?account=${encodeURIComponent(a.login)}`} className="text-xs font-semibold text-amber-300 hover:text-amber-200">{t("Нээх", "Open")}</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="privacy-h">
          <CardTitle icon="shield" id="privacy-h">{t("Нууцлал ба мэдээлэл", "Privacy and data")}</CardTitle>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-zinc-500">{t("Нөхцөл зөвшөөрсөн", "Terms accepted")}</dt><dd className="text-right text-zinc-300 tabular-nums">{user.consentAt ? `${v.date(user.consentAt)} · ${t("хувилбар", "version")} ${user.consentVersion}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-zinc-500">{t("Цагийн бүс", "Time zone")}</dt><dd className="text-right text-zinc-300">{v.timeZone}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-zinc-500">{t("Хэл", "Language")}</dt><dd className="text-right text-zinc-300">{langName}</dd></div>
          </dl>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href="/privacy" className="font-semibold text-amber-300 hover:text-amber-200">{t("Нууцлалын бодлого", "Privacy policy")}</Link>
            <Link href="/terms" className="font-semibold text-amber-300 hover:text-amber-200">{t("Үйлчилгээний нөхцөл", "Terms of service")}</Link>
            {journal.length > 0 && <a href="/api/trades/export" download className="font-semibold text-amber-300 hover:text-amber-200">{t(`Хуучин журнал (${journal.length}) татах`, `Download old journal (${journal.length})`)}</a>}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-zinc-500">{t("Profile зураг зөвхөн танд харагдана. Бүртгэлээ устгахыг Тохиргоо хуудсаас хийнэ: таны бүх мэдээлэл, зураг хамт устна.", "Your profile picture is visible only to you. Delete your account from the Settings page: all your data, the picture included, goes with it.")}</p>
        </section>
      </div>

      {site && <div id="invite"><InviteCard link={`${site}/register?ref=${code}`} days={REFERRAL_DAYS} stats={stats} /></div>}
    </div>
  );
}
