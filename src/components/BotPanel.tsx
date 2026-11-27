"use client";
import { useActionState, useCallback, useState, type MouseEvent, type ReactNode } from "react";
import type { LiveView } from "@/lib/bot/liveDb";
import type { T } from "@/lib/i18n";
import { useViewer } from "./PrefsProvider";
import { Pnl, SidePill, signedUsd, Dir } from "./Timetable";
import { saveSimpleBotAction, startBotAction, stopBotAction, closeAllAction, rotateTokenAction, type BotFormState } from "@/lib/actions/bot";
import { recordSentence, robotFileLabel, stamp, type BrokerRecord } from "@/lib/siteCopy";
import { usePoll } from "./usePoll";
import { Icon } from "./TodayIcons";
import { ConnectSteps, CopyField, EX5_HREF } from "./BotConnect";

/** The robot file the Setup signals need (minRobotVersion("ASIAN") on the server, which the browser cannot load). */
export type RobotNeeds = { need: number };
/** The Setup signals' text, built on the server from SESSION_RULES and the Setup page's describe(). */
export type SetupToolText = { lines: string[]; record: BrokerRecord | null };

type View = Omit<LiveView, "startedAt" | "stoppedAt" | "lastSeenAt" | "deals"> & {
  startedAt: string | null; stoppedAt: string | null; lastSeenAt: string | null;
  deals: (Omit<LiveView["deals"][number], "closeTime"> & { closeTime: string })[];
};

/** Why the bot stopped, by the code the server or the robot gave. */
const stopReasons = (t: T, file: string | null): Record<string, string> => ({
  MANUAL: t("гараар зогсоосон", "stopped by hand"), TARGET: t("ашгийн зорилтод хүрсэн", "profit target reached"), MAX_LOSS: t("алдагдлын хязгаарт хүрсэн", "loss limit reached"),
  TIME: t("төлөвлөсөн хугацаа дууссан", "the planned time ran out"), REVERSAL: t("чиглэл эргэсэн", "direction reversed"), NO_SIGNAL: t("удаан хугацаанд дохио гараагүй", "no signal for a long time"),
  DAILY_LOSS: t("өдрийн алдагдлын хязгаарт хүрсэн", "daily loss stop reached"),
  REAL_NOT_ALLOWED: t("жинхэнэ данс зөвшөөрөгдөөгүй", "real account not allowed"), NO_ACCESS: t("хандах эрх дууссан", "access expired"), TOO_MANY_ACCOUNTS: t("нэг багцад 3 хүртэл MT5 данс холбоно", "a plan links up to 3 MT5 accounts"),
  OLD_ROBOT: t(`роботын файл хуучин: шинэ XauBot.ex5${file ? ` (${file})` : ""} татаж солино уу`, `the robot file is old: download the new XauBot.ex5${file ? ` (${file})` : ""} and replace it`),
});
/** The few reasons the robot holds back a Setup-signal entry that a user can act on, in plain words. */
const plainBlocks = (t: T): Record<string, string> => ({
  RISK_SMALL: t("тавьсан эрсдэлд хамгийн бага лот ч багтахгүй байна: эрсдэлээ өсгөнө үү", "even the smallest lot does not fit your risk: raise the risk"),
  MARGIN: t("дансанд хангалттай чөлөөт мөнгө (margin) алга", "not enough free money (margin) in the account"),
});
const money = (v: number | null) => (v === null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const tone = (v: number | null) => (v === null || v === 0 ? "text-zinc-50" : v > 0 ? "text-emerald-400" : "text-red-400");
const signedMoney = (v: number | null) => (v === null ? "—" : <>{v !== 0 && <><Dir d={v} />{" "}</>}{signedUsd(v)}</>);

/** The user's MT5 accounts as a row of pills; each has its own settings, Start/Stop and history. Hidden with one account. */
function AccountSwitcher({ accounts, current }: { accounts: View["accounts"]; current: string }) {
  const { t } = useViewer();
  if (accounts.length < 2) return null;
  return (
    <nav aria-label={t("MT5 данс", "MT5 accounts")}>
      <ul className="flex max-w-full gap-1 overflow-x-auto rounded-[16px] border p-1" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
        {accounts.map((a) => {
          const here = a.login === current;
          return (
            <li key={a.login} className="shrink-0">
              <a href={`/bot?account=${encodeURIComponent(a.login)}`} aria-current={here ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-[12px] border px-3 text-sm whitespace-nowrap transition-colors ${here ? "font-semibold text-zinc-50" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
                style={here ? { borderColor: "var(--hairline-gold)", background: "rgb(217 181 102 / 0.1)" } : undefined}>
                <span aria-hidden className={`h-2 w-2 rounded-full ${a.online ? "bg-emerald-400" : "bg-zinc-600"}`} />
                <span className="tabular-nums">{a.label}</span>
                {a.mode === "REAL" && <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-400">{t("Жинхэнэ", "Real")}</span>}
                {a.state === "RUNNING" && <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">{t("ажиллаж байна", "running")}</span>}
                <span className="sr-only">{a.online ? t("холбогдсон", "connected") : t("холбогдоогүй", "not connected")}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The run state as a glowing orb: green and turning while running, amber when MT5 has gone quiet, grey when stopped. */
function StatusOrb({ tone }: { tone: "run" | "warn" | "stop" }) {
  const c = tone === "run" ? "var(--color-emerald-400)" : tone === "warn" ? "var(--color-amber-400)" : "var(--color-zinc-500)";
  return (
    <span aria-hidden className="relative flex h-20 w-20 shrink-0 items-center justify-center sm:h-24 sm:w-24">
      <span className="absolute inset-0 rounded-full border-2" style={{ borderColor: c, opacity: 0.2 }} />
      <span className={`absolute inset-3 rounded-full border-2 border-dashed ${tone === "run" ? "motion-safe:animate-[spin_24s_linear_infinite]" : ""}`} style={{ borderColor: c, opacity: 0.4 }} />
      <span className="relative h-7 w-7 rounded-full sm:h-8 sm:w-8" style={{ background: `radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.75), ${c} 58%)`, boxShadow: `0 0 28px ${c}` }} />
    </span>
  );
}

/** Where an open position stands between its stop and its target, with the entry marked. */
function PositionBar({ p, price }: { p: View["positions"][number]; price: number | null }) {
  const { t } = useViewer();
  if (!p.sl || !p.tp || p.sl === p.tp) return <p className="mt-2 text-xs text-zinc-500 tabular-nums">{t("Орсон", "Entry")} {p.openPrice} · SL {p.sl || "—"} · TP {p.tp || "—"}</p>;
  const f = (x: number) => Math.min(1, Math.max(0, (x - p.sl) / (p.tp - p.sl))) * 100;
  const e = f(p.openPrice), n = price === null ? null : f(price);
  return (
    <div className="mt-3">
      <div aria-hidden className="relative h-1.5 rounded-full">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-red-400/40" style={{ width: `${e}%` }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full bg-emerald-400/20" style={{ left: `${e}%` }} />
        {n !== null && <span className={`absolute inset-y-0 ${n >= e ? "bg-emerald-400" : "bg-red-400"}`} style={{ left: `${Math.min(e, n)}%`, width: `${Math.abs(n - e)}%` }} />}
        <span className="absolute -top-1 h-3.5 w-0.5 bg-zinc-100" style={{ left: `${e}%` }} />
        {n !== null && <span className="absolute -top-[3px] h-3 w-3 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_10px_var(--color-amber-300)]" style={{ left: `${n}%` }} />}
      </div>
      <p className="mt-2 flex justify-between gap-2 text-xs tabular-nums">
        <span className="text-red-400">SL {p.sl}</span>
        <span className="text-zinc-400">{t("Орсон", "Entry")} {p.openPrice}</span>
        <span className="text-emerald-400">TP {p.tp}</span>
      </p>
    </div>
  );
}

/** The token: create it once, shown once with a Copy button. */
function TokenControl({ hasToken, token, pending, action, compact = false, disabled = false }: { hasToken: boolean; token?: string; pending: boolean; action: (f: FormData) => void; compact?: boolean; disabled?: boolean }) {
  const { t } = useViewer();
  const ask = (e: MouseEvent<HTMLButtonElement>) => {
    if (hasToken && !window.confirm(t("Шинэ токен үүсгэвэл хуучин токен ажиллахаа больж, роботод шинийг буулгах хэрэгтэй болно. Үргэлжлүүлэх үү?", "A new token stops the old one, and the new one must be pasted into the robot. Continue?"))) e.preventDefault();
  };
  return (
    <div className={compact ? "" : "mt-3"}>
      {token ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-3">
          <p className="text-sm font-semibold text-amber-300">{t("Таны токен. Одоо хуулж ав: дахин харагдахгүй.", "Your token. Copy it now: it will not be shown again.")}</p>
          <CopyField value={token} label={t("Токен", "Token")} tone="secret" />
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">{t("Токеноо хэнд ч бүү өг: түүгээр таны данс энэ хуудастай холбогдоно.", "Never share your token: it ties your account to this page.")}</p>
        </div>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button className={compact ? "btn-ghost min-h-9 px-3 text-xs" : "btn"} disabled={pending || disabled} onClick={ask}>
            {pending ? t("Үүсгэж байна…", "Creating…") : hasToken ? t("Шинэ токен үүсгэх", "Create a new token") : t("Токен үүсгэх", "Create token")}
          </button>
          {!compact && hasToken && <span className="text-xs text-emerald-400">{t("Токен үүссэн ✓", "Token created ✓")}</span>}
        </form>
      )}
    </div>
  );
}

export function BotPanel({ initial, origin, syncUrl, robot, setup }: { initial: View; origin: string; syncUrl: string; robot: RobotNeeds; setup: SetupToolText }) {
  const who = useViewer();
  const { t, zone } = who;
  const needFile = robotFileLabel(robot.need);
  const STOP_REASON = stopReasons(t, needFile), BLOCK = plainBlocks(t);
  const [v, setV] = useState<View>(initial);
  const [stale, setStale] = useState(false);
  const [tokState, tokAction, tokPending] = useActionState<BotFormState, FormData>(rotateTokenAction, {});
  const [riskState, riskAction, riskPending] = useActionState<BotFormState, FormData>(saveSimpleBotAction, {});

  // Every 2 s while the tab is in view, one request at a time; the server-rendered view covers the first paint.
  const load = useCallback(() =>
    fetch(`/api/bot/status?account=${encodeURIComponent(initial.account)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: View) => { setV(d); setStale(false); })
      .catch(() => setStale(true)), [initial.account]);
  usePoll(load, 2000, true, false);

  // The connect card leads the page until the robot has reported at least once; it then folds into one line.
  const needsSetup = !v.hasToken || !v.lastSeenAt;
  const [setupAtStart] = useState(needsSetup);
  const [doneSeen, setDoneSeen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const showConnect = needsSetup || (setupAtStart && !doneSeen);
  const hasToken = v.hasToken || !!tokState.token;

  const running = v.state === "RUNNING";
  const real = v.accountMode === "REAL";
  const c = v.config;
  const oldRobot = (v.robotVersion ?? (v.online ? 1 : robot.need)) < robot.need;
  const block = v.block ? BLOCK[v.block] : undefined;

  // The risk form: % of balance or a fixed lot. A dollar amount saved by the old form shows as % until it is saved again.
  const g = c.gate;
  const [sizing, setSizing] = useState<"PCT" | "LOTS">(g.riskMode === "LOTS" ? "LOTS" : "PCT");
  const [pct, setPct] = useState(String(g.riskMode === "PCT" && g.riskValue > 0 ? g.riskValue : 1));
  const [lots, setLots] = useState(String(c.rule.lots));
  const pctNum = Number(pct), lotsNum = Number(lots);
  const riskHelp = sizing === "PCT"
    ? (v.balance !== null && pctNum > 0 ? t(`≈ ${money((v.balance * pctNum) / 100)} эрсдэл нэг арилжаанд (үлдэгдэл ${money(v.balance)})`, `≈ ${money((v.balance * pctNum) / 100)} at risk per trade (balance ${money(v.balance)})`) : t("Робот холбогдмогц эрсдэлийн дүнг доллараар харуулна.", "Once the robot connects, this shows the risk in dollars."))
    : (lotsNum > 0 ? t(`Алт $1 хөдлөхөд ≈ ${money(lotsNum * 100)} ашиг эсвэл алдагдал`, `≈ ${money(lotsNum * 100)} profit or loss for every $1 gold moves`) : "");

  const accountField = <input type="hidden" name="account" value={v.account} />;
  const today = v.dayPnl !== null ? { label: t("Өнөөдрийн ашиг/алдагдал", "Today's P/L"), val: v.dayPnl } : { label: t("Сүүлийн 24 цаг", "Last 24 hours"), val: v.pnl24h };
  const figures: [string, ReactNode, string][] = [
    [t("Үлдэгдэл", "Balance"), money(v.balance), "text-zinc-50"],
    [t("Хөрөнгө", "Equity"), money(v.equity), "text-zinc-50"],
    [today.label, signedMoney(today.val), tone(today.val)],
    [t("Нээлттэй арилжаа", "Open trades"), String(v.positions.length), "text-zinc-50"],
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      {showConnect ? (
        <section className="card p-5 sm:p-7" aria-labelledby="connect-h" style={{ borderColor: "var(--hairline-gold)" }}>
          <h2 id="connect-h" className="flex items-center gap-2 font-display text-[22px] leading-tight text-zinc-50 sm:text-[26px]">
            <Icon name="link" className="h-5 w-5 text-amber-400" />{t("Холбох — 3 алхам", "Connect — 3 steps")}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-zinc-400">{t("Windows компьютер эсвэл VPS дээрх MT5-аа нээгээд дансаараа нэвтэрнэ. Дараа нь:", "Open MT5 on your Windows computer or VPS and sign in to your account. Then:")}</p>
          <ConnectSteps origin={origin} syncUrl={syncUrl} hasToken={hasToken} online={v.online}
            tokenSlot={<TokenControl hasToken={hasToken} token={tokState.token} pending={tokPending} action={tokAction} />} />
          {!needsSetup && <button type="button" className="btn mt-4" onClick={() => setDoneSeen(true)}>{t("Болсон", "Done")}</button>}
        </section>
      ) : (
        <section className="card py-3 sm:py-3.5" aria-label={t("MT5 холболт", "MT5 connection")}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.online ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className={`font-semibold ${v.online ? "text-emerald-400" : "text-amber-300"}`}>{v.online ? t("MT5 холбогдсон", "MT5 connected") : t("MT5 холболт тасарсан", "MT5 connection lost")}</span>
            {v.accountLogin && <span className="text-zinc-400 tabular-nums">· {t("данс", "account")} {v.accountLogin}</span>}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost min-h-9 px-3 text-xs" aria-expanded={guideOpen} aria-controls="connect-guide" onClick={() => setGuideOpen((o) => !o)}>{t("Холбох заавар", "How to connect")}</button>
              <TokenControl hasToken={hasToken} pending={tokPending} action={tokAction} compact disabled={running} />
            </span>
          </div>
          {tokState.token && !guideOpen && <div className="mt-3"><TokenControl hasToken token={tokState.token} pending={false} action={tokAction} /></div>}
          {guideOpen && <div id="connect-guide" className="mt-2 border-t border-zinc-800 pt-2"><ConnectSteps origin={origin} syncUrl={syncUrl} hasToken={hasToken} online={v.online} tokenSlot={<TokenControl hasToken={hasToken} token={tokState.token} pending={tokPending} action={tokAction} disabled={running} />} /></div>}
        </section>
      )}

      <AccountSwitcher accounts={v.accounts} current={v.account} />

      <section className="card relative overflow-hidden p-5 sm:p-7" aria-labelledby="state-h"
        style={{ background: `${running ? "radial-gradient(70% 120% at 0% 0%, rgb(111 207 163 / 0.11), transparent 62%), " : ""}radial-gradient(60% 120% at 100% 100%, rgb(217 181 102 / 0.1), transparent 60%), var(--panel-bg)` }}>
        <div className="flex items-center gap-4 sm:gap-6">
          <StatusOrb tone={running ? (v.online ? "run" : "warn") : "stop"} />
          <div className="min-w-0">
            <h2 id="state-h" className={`font-display text-[26px] leading-tight sm:text-[36px] ${running ? (v.online ? "text-emerald-400" : "text-amber-300") : "text-zinc-100"}`}>
              {running ? t("Бот ажиллаж байна", "Bot is running") : t("Бот зогссон", "Bot is stopped")}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ${v.online ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-400/15 text-amber-300"}`}>
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${v.online ? "bg-emerald-400" : "bg-amber-400"}`} />
                MT5: {v.online ? t("холбогдсон", "connected") : v.lastSeenAt ? t("холболт тасарсан", "connection lost") : t("холбогдоогүй", "not connected")}
              </span>
              {v.accountMode && <span className={`rounded-full px-2.5 py-0.5 font-semibold ${real ? "bg-red-500/15 text-red-400" : "bg-white/[0.06] text-zinc-300"}`}>{real ? t("Жинхэнэ данс", "Real account") : t("Demo данс", "Demo account")}</span>}
              {stale && <span className="text-amber-300">{t("самбар шинэчлэгдэхгүй байна", "the panel is not updating")}</span>}
            </p>
            {!running && v.stopReason && <p className="mt-2 text-sm text-zinc-400">{t("Зогссон шалтгаан", "Why it stopped")}: {STOP_REASON[v.stopReason] ?? v.stopReason}</p>}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {figures.map(([label, val, cls]) => (
            <div key={label} className="glass-tile min-w-0 px-3.5 py-3">
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className={`mt-0.5 text-[clamp(1rem,4.5vw,1.5rem)] leading-tight font-semibold tabular-nums ${cls}`}>{val}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {running
            ? <form action={stopBotAction} className="max-sm:w-full">{accountField}<button className="btn-ghost w-full px-8 text-base">■ {t("Зогсоох", "Stop")}</button></form>
            : <form action={startBotAction} className="max-sm:w-full">{accountField}<button className="btn w-full px-10 text-base" disabled={!v.hasToken}>▶ {t("Эхлүүлэх", "Start")}</button></form>}
          <form action={closeAllAction} className="max-sm:w-full">{accountField}<button className="btn-ghost w-full text-red-400" style={{ borderColor: "rgb(234 131 112 / 0.4)" }} disabled={v.positions.length === 0}>{t("Бүгдийг хаах", "Close all")}</button></form>
          {v.closeAllPending && <span role="status" className="text-xs font-medium text-amber-300">{t("Арилжаануудыг хааж байна…", "Closing trades…")}</span>}
        </div>

        <div className="mt-4 space-y-2 text-sm leading-relaxed">
          {!v.hasToken && <p className="text-zinc-400">{t("Эхлүүлэхийн өмнө дээрх 3 алхмаар MT5-аа холбоно уу.", "Connect your MT5 with the 3 steps above before you start.")}</p>}
          {real && !c.allowReal && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-red-300">{t("Энэ бол жинхэнэ данс. Жинхэнэ дансаар арилжаа хийхийг зөвшөөрөөгүй тул бот арилжаа хийхгүй. Доорх «Эрсдэл» хэсгээс зөвшөөрнө үү.", "This is a real account. Real trading is not allowed, so the bot will not trade. Allow it in the Risk section below.")}</p>
          )}
          {real && c.allowReal && <p className="text-red-300">{t("Жинхэнэ данс: бот жинхэнэ мөнгөөр арилжаа хийнэ.", "Real account: the bot trades real money.")}</p>}
          {oldRobot && (
            <p role="alert" className="rounded-xl bg-amber-400/10 px-3.5 py-2.5 text-amber-200">
              {t("Роботын шинэ файлаа татаж солино уу", "Download the new robot file and replace the old one")}: <a className="font-semibold underline" href={EX5_HREF}>XauBot.ex5{needFile ? ` (${needFile})` : ""}</a>
            </p>
          )}
          {v.hasToken && !v.online && <p className="text-amber-300">{t("MT5 холбогдоогүй үед бот арилжаа хийхгүй. Робот холбогдмогц тушаалыг авна.", "While MT5 is not connected the bot places no trades. The robot picks up the command as soon as it connects.")}</p>}
          {running && v.online && !block && <p className="text-zinc-400">{v.positions.length > 0 ? t("Арилжаа нээлттэй. Stop, target эсвэл дүрмийн хаах цагт хаагдана.", "A trade is open. It closes at its stop, its target or the rule's closing time.") : t("Setup дохио гармагц орно. Stop, target, хаах цагийг дүрэм тогтооно.", "It enters as soon as a Setup signal appears. The rule sets the stop, the target and the closing time.")}</p>}
          {running && block && <p className="text-amber-300">{t("Одоо орохгүй байгаа шалтгаан", "Why it is not entering now")}: {block}</p>}
          {v.online && v.bid !== null && <p className="text-xs text-zinc-500 tabular-nums">{v.symbol ?? "XAUUSD"} · bid {v.bid} · ask {v.ask ?? "—"}</p>}
        </div>
      </section>

      <form action={riskAction} className="card space-y-4" aria-labelledby="risk-h">{accountField}
        <div>
          <h2 id="risk-h" className="flex items-center gap-2 text-base font-semibold text-zinc-100"><Icon name="shield" className="h-[18px] w-[18px] text-amber-400" />{t("Эрсдэл", "Risk")}</h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-zinc-400">{t("Нэг арилжаа хэр том байхыг сонгоно. Хадгалсны дараагийн арилжаанаас үйлчилнэ.", "Choose how big each trade is. It applies from the next trade after saving.")}</p>
        </div>
        <fieldset>
          <legend className="label">{t("Арилжааны хэмжээ", "Trade size")}</legend>
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1">
            {([["PCT", t("Балансын %", "% of balance")], ["LOTS", t("Тогтмол лот", "Fixed lot")]] as const).map(([val, text]) => (
              <label key={val} className="cursor-pointer">
                <input type="radio" name="sizing" value={val} checked={sizing === val} onChange={() => setSizing(val)} className="peer sr-only" />
                <span className="flex min-h-10 items-center rounded-lg px-3.5 text-sm text-zinc-300 transition-colors peer-checked:bg-[var(--accent-bg)] peer-checked:font-semibold peer-checked:text-[var(--accent-fg)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-amber-400 sm:min-h-9">{text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="max-w-xs">
          {sizing === "PCT" ? (
            <>
              <label className="label" htmlFor="risk-pct">{t("Нэг арилжаанд балансын хэдэн хувийг эрсдэлд оруулах (0.1–5)", "Share of balance to risk per trade (0.1–5)")}</label>
              <div className="flex items-center gap-2">
                <input className="input tabular-nums" id="risk-pct" name="pct" type="number" inputMode="decimal" step="0.1" min="0.1" max="5" required value={pct} onChange={(e) => setPct(e.target.value)} />
                <span aria-hidden className="text-sm text-zinc-400">%</span>
              </div>
            </>
          ) : (
            <>
              <label className="label" htmlFor="risk-lots">{t("Нэг арилжааны лот", "Lots per trade")}</label>
              <input className="input tabular-nums" id="risk-lots" name="lots" type="number" inputMode="decimal" step="0.01" min="0.01" max="100" required value={lots} onChange={(e) => setLots(e.target.value)} />
            </>
          )}
          {riskHelp && <p className="mt-2 text-sm text-zinc-300 tabular-nums" aria-live="polite">{riskHelp}</p>}
        </div>
        {g.riskMode === "USD" && g.riskValue > 0 && <p className="text-xs text-zinc-500">{t(`Одоогийн тохиргоо: арилжаа бүрт ${money(g.riskValue)}. Хадгалбал дээрх сонголтоор солигдоно.`, `Current setting: ${money(g.riskValue)} per trade. Saving replaces it with the choice above.`)}</p>}
        <label className="flex items-start gap-3 border-t border-zinc-800 pt-4 text-sm text-zinc-200">
          <input type="checkbox" name="allowReal" defaultChecked={c.allowReal} className="switch mt-0.5" />
          <span>{t("Жинхэнэ дансаар арилжаа хийхийг зөвшөөрөх", "Allow trading on a real account")}
            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{t("Унтраалттай үед бот зөвхөн demo дансаар арилжаална. Асаавал MT5 дээрх роботын Inputs-д AllowRealAccount = true болгох хэрэгтэй.", "When off, the bot trades only on a demo account. If you switch it on, also set AllowRealAccount = true in the robot's Inputs in MT5.")}</span>
          </span>
        </label>
        {riskState.error && <p role="alert" className="text-sm text-red-400">{riskState.error}</p>}
        {riskState.ok && <p role="status" className="text-sm text-emerald-400">{riskState.ok}</p>}
        <button className="btn" disabled={riskPending}>{riskPending ? t("Хадгалж байна…", "Saving…") : t("Хадгалах", "Save")}</button>
      </form>

      <section className="card" aria-labelledby="open-h">
        <div className="flex items-center gap-2">
          <Icon name="layers" className="h-[18px] w-[18px] text-amber-400" />
          <h2 id="open-h" className="text-base font-semibold text-zinc-100">{t("Нээлттэй арилжаа", "Open positions")} · {v.positions.length}</h2>
          {v.positions.length > 0 && <Pnl value={Math.round(v.positions.reduce((a, p) => a + p.profit, 0) * 100) / 100} className="ml-auto text-lg" />}
        </div>
        {v.positions.length === 0 ? <p className="mt-3 text-sm text-zinc-500">{t("Одоогоор нээлттэй арилжаа алга.", "No open trades right now.")}</p> : (
          <ul className="mt-4 space-y-3">
            {v.positions.map((p) => (
              <li key={p.ticket} className="glass-tile p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <SidePill side={p.side} label={`${p.side} ${p.lots}`} />
                  <span className="text-xs text-zinc-500 tabular-nums">#{p.ticket}</span>
                  <Pnl value={p.profit} className="ml-auto" />
                </div>
                <PositionBar p={p} price={p.side === "BUY" ? v.bid : v.ask} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="table-card" aria-labelledby="hist-h">
        <h2 id="hist-h" className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2 text-base font-semibold text-zinc-100 sm:px-5 sm:pt-5"><Icon name="history" className="h-[18px] w-[18px] text-amber-400" />{t("Арилжааны түүх", "Trade history")} <span className="text-sm font-normal text-zinc-500">{t(`(сүүлийн 50, нийт ${v.dealCount})`, `(last 50, total ${v.dealCount})`)}</span></h2>
        {v.deals.length === 0 ? <p className="px-4 pb-4 text-sm text-zinc-500 sm:px-5 sm:pb-5">{t("Хаагдсан арилжаа одоогоор алга.", "No closed trades yet.")}</p> : (
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-zinc-800">{([[`${t("Хаагдсан", "Closed")} (${zone})`, ""], [t("Чиглэл", "Side"), ""], [t("Лот", "Lots"), "text-right"], [t("Орсон", "Entry"), "hidden sm:table-cell text-right"], [t("Гарсан", "Exit"), "hidden sm:table-cell text-right"], [t("Үр дүн", "P/L"), "text-right"]] as const).map(([h, cls]) => <th key={h} className={`th ${cls}`}>{h}</th>)}</tr></thead>
            <tbody>{v.deals.map((d) => (
              <tr key={d.ticket} className="border-t border-zinc-800/70 first:border-t-0">
                <td className="td font-semibold whitespace-nowrap text-zinc-50 tabular-nums">{stamp(who, new Date(d.closeTime))}</td>
                <td className="td"><SidePill side={d.side} /></td>
                <td className="td text-right tabular-nums">{d.lots}</td><td className="td hidden text-right text-zinc-400 tabular-nums sm:table-cell">{d.openPrice}</td><td className="td hidden text-right text-zinc-400 tabular-nums sm:table-cell">{d.closePrice}</td>
                <td className="td text-right"><Pnl value={d.profit} /></td>
              </tr>))}</tbody>
          </table>
        )}
      </section>

      <details className="card group">
        <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 text-base font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
          <Icon name="crosshair" className="h-[18px] w-[18px] text-amber-400" />{t("Систем юу хийдэг вэ", "What the system does")}
          <svg aria-hidden viewBox="0 0 12 12" className="ml-auto h-3 w-3 text-zinc-500 transition-transform group-open:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="mt-3 max-w-prose space-y-3 text-sm leading-relaxed text-zinc-300">
          <p>{t(`Бот өдөр бүр 3 setup-ийг дагана. Setup бүр өдөрт нэг удаа, нийт өдөрт 3 хүртэл арилжаа. Цаг ${zone}-аар:`, `The bot follows 3 setups every day. Each setup trades at most once a day, up to 3 trades a day in all. Times in ${zone}:`)}</p>
          <ul className="list-disc space-y-1 pl-5 text-zinc-400">{setup.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          {setup.record && <p className="text-zinc-400">{recordSentence(setup.record, t)}</p>}
          <p className="text-amber-300">{t("Эхлээд demo дансаар туршаарай. Бот зөвхөн MT5 болон компьютер асаалттай үед ажиллана. Санхүүгийн зөвлөгөө биш.", "Try it on a demo account first. The bot works only while MT5 and the computer are on. Not financial advice.")}</p>
        </div>
      </details>
    </div>
  );
}
