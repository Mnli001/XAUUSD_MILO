import Link from "next/link";
import type { T } from "@/lib/i18n";
import type { Viewer } from "@/lib/viewer";
import type { BotSummary, TradeSummary, PlanSummary } from "@/lib/dashboard";
import type { SetupStatus } from "@/lib/setup/setups";
import { PLANS } from "@/lib/plans";
import { Masked, UnlockLink } from "./Paywall";
import { Pnl, SidePill } from "./Timetable";

/** What the dashboard needs from a setup: never the rule text or the chart. */
export type DashSetup = { id: string; name: string; status: SetupStatus; side: "BUY" | "SELL" | null; headline: string; entry: number | null; stop: number | null; target: number | null };

const RENEW_WITHIN_DAYS = 7;
const px = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const linkCls = "inline-flex min-h-9 items-center text-sm font-semibold text-amber-300 hover:text-amber-200";

const statusWord = (t: T): Record<SetupStatus, [string, string]> => ({
  ACTIVE: [t("Идэвхтэй", "Active"), "bg-emerald-500/15 text-emerald-400"],
  WATCH: [t("Ажиглах", "Watch"), "bg-amber-400/15 text-amber-300"],
  FORMING: [t("Бүрдэж байна", "Forming"), "bg-zinc-800 text-zinc-200"],
  OFF: [t("Одоо алга", "Not now"), "border border-zinc-800 text-zinc-500"],
});

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `dash-${title.replace(/\W+/g, "-").toLowerCase() || "tile"}`;
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
      <h3 id={id} className="text-sm font-semibold text-zinc-400">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function PlanTile({ plan, v }: { plan: PlanSummary; v: Viewer }) {
  const { t } = v;
  return (
    <Tile title={t("Багц", "Plan")}>
      {plan.kind === "admin" ? (
        <p className="text-lg font-semibold text-zinc-100">{t("Админ — бүх эрх нээлттэй", "Admin — full access")}</p>
      ) : plan.kind === "active" ? (
        <>
          <p className="text-2xl font-semibold text-zinc-100">{plan.plan ? PLANS[plan.plan].name : t("Идэвхтэй", "Active")}</p>
          <p className={`mt-1 text-sm tabular-nums ${plan.daysLeft <= RENEW_WITHIN_DAYS ? "text-amber-300" : "text-zinc-300"}`}>
            {t(`${plan.daysLeft} хоног үлдсэн`, `${plan.daysLeft} days left`)} · {t(`${v.date(plan.until)} хүртэл`, `until ${v.date(plan.until)}`)}
          </p>
          {plan.daysLeft <= RENEW_WITHIN_DAYS && <Link href="/plans" className={`${linkCls} mt-1`}>{t("Сунгах", "Renew")}</Link>}
        </>
      ) : plan.kind === "expired" ? (
        <>
          <p className="text-lg font-semibold text-zinc-100">{t(`${v.date(plan.until)}-нд дууссан`, `Ended ${v.date(plan.until)}`)}</p>
          <Link href="/plans" className={`${linkCls} mt-1`}>{t("Сунгах", "Renew")}</Link>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-zinc-100">{t("Багц алга", "No plan")}</p>
          <Link href="/plans" className={`${linkCls} mt-1`}>{t("Багц авах", "Get a plan")}</Link>
        </>
      )}
    </Tile>
  );
}

function TradesTile({ j, t }: { j: TradeSummary; t: T }) {
  return (
    <Tile title={t("Ботын арилжаа · 30 хоног", "Bot trades · 30 days")}>
      {j.allTime.closed === 0 && j.open === 0 ? (
        <>
          <p className="text-sm text-zinc-300">{t("Робот одоогоор арилжаа хаагаагүй. Хаах бүрд үр дүн энд автоматаар гарна.", "The robot has not closed a trade yet. Each one it closes shows up here by itself.")}</p>
          <Link href="/bot" className={`${linkCls} mt-1`}>{t("Бот руу", "Open the bot")}</Link>
        </>
      ) : (
        <>
          <p className="text-2xl"><Pnl value={j.month.pnl} /></p>
          <p className="mt-1 text-sm text-zinc-300 tabular-nums">
            {t(`${j.month.closed} арилжаа`, `${j.month.closed} trades`)}
            {j.month.winRate !== null && <> · {t(`${j.month.winRate}% ашигтай`, `${j.month.winRate}% in profit`)}</>}
            {j.open > 0 && <> · {t(`${j.open} нээлттэй`, `${j.open} open`)}</>}
          </p>
          <Link href="/performance" className={`${linkCls} mt-1`}>{t("Гүйцэтгэл рүү", "Open performance")}</Link>
        </>
      )}
    </Tile>
  );
}

function BotTile({ bot, t }: { bot: BotSummary | null; t: T }) {
  return (
    <Tile title={t("Бот", "Bot")}>
      {bot === null ? (
        <>
          <p className="text-lg"><Masked t={t} /></p>
          <UnlockLink t={t} />
        </>
      ) : !bot.connected && !bot.account ? (
        <>
          <p className="text-sm text-zinc-300">{t("MT5 холбогдоогүй байна.", "MT5 is not connected.")}</p>
          <Link href="/bot" className={`${linkCls} mt-1`}>{t("Тохируулах", "Set it up")}</Link>
        </>
      ) : (
        <>
          <p className={`flex items-center gap-2 text-lg font-semibold ${bot.running ? (bot.online ? "text-emerald-400" : "text-amber-300") : "text-zinc-300"}`}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${bot.running ? (bot.online ? "animate-pulse bg-emerald-400" : "bg-amber-400") : "bg-zinc-500"}`} />
            {bot.running ? t("Ажиллаж байна", "Running") : t("Зогссон", "Stopped")}
          </p>
          {bot.running && !bot.online && <p className="mt-1 text-sm text-amber-300">{t("MT5 холболт тасарсан: терминал асаалттай эсэхийг шалгана уу.", "MT5 has gone quiet: check the terminal is on.")}</p>}
          <p className="mt-1 text-sm text-zinc-300 tabular-nums">
            {t(`${bot.positions} позиц нээлттэй`, `${bot.positions} open positions`)} · {t("24 цаг", "24 h")} <Pnl value={bot.pnl24h} />
          </p>
          <Link href="/bot" className={`${linkCls} mt-1`}>{t("Бот руу", "Open the bot")}</Link>
        </>
      )}
    </Tile>
  );
}

function SetupsTile({ setups, t }: { setups: DashSetup[] | null; t: T }) {
  const words = statusWord(t);
  return (
    <Tile title="Setup">
      {setups === null ? (
        <>
          <p className="text-sm text-zinc-300">{t("Одоо орох боломж байгаа эсэх:", "Whether an entry is on now:")} <Masked t={t} /></p>
          <UnlockLink t={t} />
        </>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {setups.map((s) => {
              const [word, tone] = words[s.status];
              const live = s.status !== "OFF" && s.side !== null && s.entry !== null;
              return (
                <li key={s.id} className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-100">{s.name}</span>
                    <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${tone}`}>{word}</span>
                  </div>
                  {live ? (
                    <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                      <SidePill side={s.side!} label={s.side === "BUY" ? t("Авах", "Buy") : t("Зарах", "Sell")} />
                      <div className="flex gap-1.5"><dt className="text-zinc-400">{t("Орох", "Entry")}</dt><dd className="font-semibold text-amber-300">{px(s.entry!)}</dd></div>
                      {s.stop !== null && <div className="flex gap-1.5"><dt className="text-zinc-400">Stop</dt><dd className="font-semibold text-red-400">{px(s.stop)}</dd></div>}
                      {s.target !== null && <div className="flex gap-1.5"><dt className="text-zinc-400">Target</dt><dd className="font-semibold text-emerald-400">{px(s.target)}</dd></div>}
                    </dl>
                  ) : (
                    <p className="mt-1 text-sm text-zinc-400">{s.headline}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <Link href="/setup" className={`${linkCls} mt-2`}>{t("Setup хуудсанд дэлгэрэнгүй", "Details on the Setup page")}</Link>
        </>
      )}
    </Tile>
  );
}

/**
 * The personal strip at the top of Today. `bot` and `setups` are null for a user without a plan:
 * their figures are then never loaded, so they cannot be read from the page.
 */
export function MyDashboard({ v, name, plan, trades, bot, setups }: { v: Viewer; name: string | null; plan: PlanSummary; trades: TradeSummary; bot: BotSummary | null; setups: DashSetup[] | null }) {
  const { t } = v;
  return (
    <section className="card" aria-labelledby="mine-h">
      <h2 id="mine-h" className="text-lg font-semibold text-zinc-100">{name ? t(`Сайн уу, ${name}`, `Hello, ${name}`) : t("Миний самбар", "My dashboard")}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <PlanTile plan={plan} v={v} />
        <TradesTile j={trades} t={t} />
        <BotTile bot={bot} t={t} />
        <div className="md:col-span-3"><SetupsTile setups={setups} t={t} /></div>
      </div>
    </section>
  );
}
