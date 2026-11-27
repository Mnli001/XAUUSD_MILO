import Link from "next/link";
import type { ReactNode } from "react";
import type { T } from "@/lib/i18n";
import type { Viewer } from "@/lib/viewer";
import type { BotSummary, TradeSummary, PlanSummary } from "@/lib/dashboard";
import type { SetupStatus } from "@/lib/setup/setups";
import { PLANS } from "@/lib/plans";
import { Masked, UnlockLink } from "./Paywall";
import { Pnl, SidePill } from "./Timetable";
import { Icon } from "./TodayIcons";

/** What the dashboard needs from a setup: never the rule text or the chart. */
export type DashSetup = { id: string; name: string; status: SetupStatus; side: "BUY" | "SELL" | null; headline: string; entry: number | null; stop: number | null; target: number | null };

const RENEW_WITHIN_DAYS = 7;
const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusWord = (t: T): Record<SetupStatus, [string, string]> => ({
  ACTIVE: [t("Идэвхтэй", "Active"), "bg-emerald-500/15 text-emerald-400"],
  WATCH: [t("Ажиглах", "Watch"), "bg-amber-400/15 text-amber-300"],
  FORMING: [t("Бүрдэж байна", "Forming"), "bg-zinc-500/15 text-zinc-200"],
  OFF: [t("Одоо алга", "Not now"), "border border-zinc-800 text-zinc-500"],
});

/** One small linked figure in the strip beside the greeting: a label above, the value below. */
function Chip({ href, icon, label, tone = "text-zinc-100", children }: { href: string; icon: Parameters<typeof Icon>[0]["name"]; label: string; tone?: string; children: ReactNode }) {
  return (
    <Link href={href} data-chip className="glass-tile flex min-w-max shrink-0 items-center gap-2.5 px-3.5 py-2 hover:border-[var(--hairline-gold)]">
      <Icon name={icon} className={`h-[18px] w-[18px] shrink-0 ${tone}`} />
      <span className="min-w-0">
        <span className="block text-xs text-zinc-500">{label}</span>
        <span className={`block text-sm font-semibold whitespace-nowrap tabular-nums ${tone}`}>{children}</span>
      </span>
    </Link>
  );
}

function PlanChip({ plan, v }: { plan: PlanSummary; v: Viewer }) {
  const { t } = v;
  const label = t("Багц", "Plan");
  if (plan.kind === "admin") return <Chip href="/plans" icon="wallet" label={label} tone="text-amber-300">{t("Админ · бүх эрх", "Admin · full access")}</Chip>;
  if (plan.kind === "active") {
    const soon = plan.daysLeft <= RENEW_WITHIN_DAYS;
    return (
      <Chip href="/plans" icon="wallet" label={`${label} · ${t(`${v.date(plan.until)} хүртэл`, `until ${v.date(plan.until)}`)}`} tone="text-amber-300">
        {plan.plan ? PLANS[plan.plan].name : t("Идэвхтэй", "Active")} · {t(`${plan.daysLeft} хоног үлдсэн`, `${plan.daysLeft} days left`)}{soon && <> · {t("Сунгах", "Renew")}</>}
      </Chip>
    );
  }
  if (plan.kind === "expired") return <Chip href="/plans" icon="wallet" label={t(`${v.date(plan.until)}-нд дууссан`, `Ended ${v.date(plan.until)}`)} tone="text-amber-300">{t("Сунгах", "Renew")}</Chip>;
  return <Chip href="/plans" icon="wallet" label={t("Багц алга", "No plan")} tone="text-amber-300">{t("Багц авах", "Get a plan")}</Chip>;
}

function BotChip({ bot, t }: { bot: BotSummary | null; t: T }) {
  const label = t("Bot", "Bot");
  if (bot === null) return <Chip href="/plans" icon="bot" label={label} tone="text-zinc-400"><Masked t={t} /></Chip>;
  if (!bot.connected && !bot.account) return <Chip href="/bot" icon="bot" label={`${label} · ${t("MT5 холбогдоогүй", "MT5 not connected")}`} tone="text-amber-300">{t("Тохируулах", "Set it up")}</Chip>;
  if (!bot.running) return <Chip href="/bot" icon="bot" label={label} tone="text-zinc-300">{t("Зогссон", "Stopped")}</Chip>;
  if (!bot.online) return <Chip href="/bot" icon="bot" label={`${label} · ${t("Ажиллаж байна", "Running")}`} tone="text-amber-300">{t("MT5 холболт тасарсан", "MT5 has gone quiet")}</Chip>;
  return (
    <Chip href="/bot" icon="bot" label={`${label} · ${t("Ажиллаж байна", "Running")}`} tone="text-emerald-400">
      {t(`${bot.positions} position`, `${bot.positions} open`)} · {t("24ц", "24h")} <Pnl value={bot.pnl24h} />
    </Chip>
  );
}

function TradesChip({ j, t }: { j: TradeSummary; t: T }) {
  const label = t("Bot-ын 30 хоног", "Bot · 30 days");
  if (j.allTime.closed === 0 && j.open === 0) return <Chip href="/bot" icon="chart" label={label} tone="text-zinc-300">{t("Арилжаа хараахан алга", "No trades yet")}</Chip>;
  return (
    <Chip href="/performance" icon="chart" label={label}>
      <Pnl value={j.month.pnl} /> · {t(`${j.month.closed} арилжаа`, `${j.month.closed} trades`)}
      {j.month.winRate !== null && <> · {t(`${j.month.winRate}% ашигтай`, `${j.month.winRate}% won`)}</>}
    </Chip>
  );
}

/**
 * The plan, the bot and the robot's month as three small linked figures beside the greeting. `bot` is null for a user
 * without a plan: its figures are then never loaded. On a phone the strip scrolls sideways.
 */
export function AccountChips({ v, plan, trades, bot }: { v: Viewer; plan: PlanSummary; trades: TradeSummary; bot: BotSummary | null }) {
  const { t } = v;
  return (
    <nav aria-label={t("Миний самбар", "My dashboard")} className="relative -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:justify-end lg:overflow-visible lg:pb-0">
      <PlanChip plan={plan} v={v} />
      <BotChip bot={bot} t={t} />
      <TradesChip j={trades} t={t} />
    </nav>
  );
}

/** Today's setups with their state; a live one shows its side, entry, stop and target. `setups` is null without a plan. */
export function SetupsCard({ setups, t }: { setups: DashSetup[] | null; t: T }) {
  const words = statusWord(t);
  return (
    <section className="card flex flex-col" aria-labelledby="setups-h">
      <div className="flex items-center gap-2">
        <Icon name="crosshair" className="h-[18px] w-[18px] text-amber-400" />
        <h2 id="setups-h" className="text-base font-semibold text-zinc-100">Setup</h2>
        <Link href="/setup" className="ml-auto text-sm font-semibold text-amber-300 hover:text-amber-200">{t("Setup хуудас", "Setup page")}</Link>
      </div>
      {setups === null ? (
        <div className="mt-4">
          <p className="text-sm text-zinc-300">{t("Одоо орох боломж байгаа эсэх:", "Whether an entry is on now:")} <Masked t={t} /></p>
          <UnlockLink t={t} />
        </div>
      ) : setups.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">{t("Setup ачаалж чадсангүй", "Setups could not be loaded")}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {setups.map((s) => {
            const [word, tone] = words[s.status];
            const live = s.status !== "OFF" && s.side !== null && s.entry !== null;
            return (
              <li key={s.id} className="glass-tile px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-semibold text-zinc-100">{s.name}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tone}`}>{word}</span>
                </div>
                {live ? (
                  <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                    <SidePill side={s.side!} label={s.side === "BUY" ? t("Авах", "Buy") : t("Зарах", "Sell")} />
                    <div className="flex gap-1.5"><dt className="text-zinc-400">{t("Орох", "Entry")}</dt><dd className="font-semibold text-amber-300">{px(s.entry!)}</dd></div>
                    {s.stop !== null && <div className="flex gap-1.5"><dt className="text-zinc-400">Stop</dt><dd className="font-semibold text-red-400">{px(s.stop)}</dd></div>}
                    {s.target !== null && <div className="flex gap-1.5"><dt className="text-zinc-400">Target</dt><dd className="font-semibold text-emerald-400">{px(s.target)}</dd></div>}
                  </dl>
                ) : (
                  <p className="mt-1 text-[13px] text-zinc-500">{s.headline}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
