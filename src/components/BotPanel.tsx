"use client";
import { TermHint } from "./TermHint";
import { useActionState, useCallback, useState } from "react";
import type { LiveView } from "@/lib/bot/liveDb";
import type { T } from "@/lib/i18n";
import { useViewer } from "./PrefsProvider";
import { Figures, Pnl, SidePill, Station, signedUsd, Dir } from "./Timetable";
import { saveBotConfigAction, saveGateAction, startBotAction, stopBotAction, closeAllAction, rotateTokenAction, type BotFormState } from "@/lib/actions/bot";
import { sessionLabel } from "@/lib/time";
import { recordSentence, robotFileLabel, stamp, type BrokerRecord } from "@/lib/siteCopy";
import { usePoll } from "./usePoll";

/** What the server knows about robot files (from lib/bot/live, which the browser cannot load). */
export type RobotNeeds = { need: Record<string, number>; latest: number };
/** The Setup signals tool's text, built on the server from SESSION_RULES and the Setup page's describe(). */
export type SetupToolText = { lines: string[]; record: BrokerRecord | null };

type View = Omit<LiveView, "startedAt" | "stoppedAt" | "lastSeenAt" | "deals"> & {
  startedAt: string | null; stoppedAt: string | null; lastSeenAt: string | null;
  deals: (Omit<LiveView["deals"][number], "closeTime"> & { closeTime: string })[];
};

const stopReasons = (t: T, file: string | null): Record<string, string> => ({
  MANUAL: t("гараар зогсоосон", "stopped by hand"), TARGET: t("ашгийн зорилтод хүрсэн", "profit target reached"), MAX_LOSS: t("алдагдлын хязгаарт хүрсэн", "loss limit reached"),
  TIME: t("ботын тооцсон хугацаа дууссан", "the time the bot planned has run out"), REVERSAL: t("чиглэл эргэсэн", "direction reversed"), NO_SIGNAL: t("30 минутад орох нөхцөл бүрдээгүй (дохио гараагүй эсвэл шүүлтүүр хаасан)", "no entry for 30 minutes (no signal, or the entry filter held it back)"),
  DAILY_LOSS: t("өдрийн алдагдлын хязгаарт хүрсэн", "daily loss stop reached"),
  REAL_NOT_ALLOWED: t("жинхэнэ данс зөвшөөрөгдөөгүй", "real account not allowed"), NO_ACCESS: t("хандах эрх дууссан", "access expired"), TOO_MANY_ACCOUNTS: t("нэг багцад 3 хүртэл MT5 данс холбоно", "a plan links up to 3 MT5 accounts"),
  OLD_ROBOT: t(`MT5 дээрх роботын файл хуучин: шинэ XauBot.ex5${file ? ` (${file})` : ""} татаж солино уу`, `the robot file on MT5 is old: download the new XauBot.ex5${file ? ` (${file})` : ""} and replace it`),
});
/** Why the robot is holding back an entry, by the code it reports (GateCheck in XauBot.mq5). */
const blockReasons = (t: T, dayStart: string): Record<string, string> => ({
  DAILY_LOSS: t(`өдрийн алдагдлын хязгаарт хүрсэн: арилжааг хаасан, ${dayStart}-аас дахин орно`, `the daily loss stop was reached: trades closed, entries resume at ${dayStart}`),
  MAX_TRADES: t("өнөөдрийн орох тоо дууссан", "today's entries are used up"),
  DAY_BUDGET: t("энэ арилжааны эрсдэл өдрийн алдагдлын хязгаарын үлдэгдлээс их байна: эрсдэлээ багасгах эсвэл өдрийн хязгаараа өсгөнө үү", "this trade's risk is larger than what is left of the daily loss limit: lower the risk or raise the daily limit"),
  RISK_SMALL: t("тавьсан эрсдэлд брокерын доод лот ч багтахгүй байна: эрсдэлийн дүнгээ өсгөнө үү", "even the broker's minimum lot does not fit the chosen risk: raise the risk amount"),
  MARGIN: t("дансны чөлөөт margin хүрэлцэхгүй", "not enough free margin in the account"),
  SITE_STOP: t("сайтын шинжилгээнээс stop-ийн зай ирээгүй байна", "no stop distance from the site reading yet"),
  CONSENSUS: t("сайтын олон аргын дүгнэлт орох чиглэлийг хангалттай дэмжихгүй байна", "the site's many-method reading does not back the entry side strongly enough"),
  SESSION: t("арилжааны цагаас гадуур", "outside the trading hours"),
  ROLLOVER: t("брокерын өдрийн солилт, spread тэлдэг", "the broker's daily rollover, when spreads widen"),
  NEWS: t("чухал мэдээний өмнө/дараа", "around a high-impact release"),
  DATA: t("индикаторын дата ачаалж байна", "loading indicator data"),
  ATR_LOW: t("зах хэт тайван (ATR бага)", "the market is too quiet (low ATR)"),
  ATR_HIGH: t("зах хэт огцом хөдөлж байна (ATR өндөр)", "the market is moving too violently (high ATR)"),
  SPREAD: t("spread хэт өргөн", "the spread is too wide"),
  TREND: t("H1, M15 тренд орох чиглэлтэй таарахгүй", "the H1 and M15 trend disagree with the entry"),
  RSI: t("RSI хэт сунасан: хөдөлгөөний араас хөөхгүй", "RSI is overstretched: it will not chase the move"),
  EXTENDED: t("үнэ EMA20-оос хэт холдсон", "price is too far from EMA20"),
});
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const toolList = (t: T) => [
  ["DAY", t("Өдрийн арилжаа (Day trader)", "Day trader"), t("15 минутын чарт дээр: ханш liquidity шүүрдээд (sweep), бүтэц эвдээд (MSS), ойрын FVG руу буцаж ирээд хариу үйлдэл үзүүлэхэд орно. Гэхдээ зөвхөн сайтын бусад аргуудын дүгнэлт ижил чиглэлд байвал. Stop нь sweep-ийн оргилын цаана, ашиг = stop × 2.", "On the 15-minute chart: price sweeps liquidity, shifts structure (MSS), returns to the nearest fair value gap and reacts, and only then does it enter, and only if the site's other methods read the same way. The stop sits beyond the sweep, the target is twice the stop.")],
  ["READING", t("Дүгнэлт", "Reading"), t("Сайтын олон аргын дүгнэлтийг шууд дагана: 15 минут тутам шалгаж, хангалттай олон арга нэг чиглэл заахад орно. Stop = 1 цагийн ATR × 1.5, ашиг = stop × 2. Нэг удаад нэг арилжаа.", "Follows the site's many-method reading directly: checked every 15 minutes, it enters when enough methods point one way. Stop = 1-hour ATR × 1.5, target = stop × 2. One trade at a time.")],
  ["BASKET", t("Багц", "Basket"), t("Дохио гармагц олон арилжааг зэрэг нээнэ. Нийт ашиг таны тавьсан дүнд хүрмэгц бүгдийг зэрэг хаана.", "Opens many trades at once when a signal appears. Closes them all together once total profit reaches your amount.")],
  ["ASIAN", t("Setup дохио", "Setup signals"), t("Setup хуудасны 3 setup (Ази, Нью-Йоркийн 2 нээлт): хүрээнээс трендийн чиглэлд гарахад орно. Setup бүр өдөрт нэг, нийт өдөрт 3 хүртэл арилжаа. Stop, target (Ази 3R, Нью-Йорк 2R), хаах цагийг дүрэм тогтооно; нэмэлт шүүлтүүргүй.", "The 3 setups on the Setup page (Asia, two New York openings): enters when price leaves a range in the trend's direction. One trade per setup a day, up to three a day in all. The rule sets the stop, the target (Asia 3R, New York 2R) and the closing time; no extra filters.")],
] as const;
const money = (v: number | null) => (v === null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const tone = (v: number | null) => (v === null || v === 0 ? "text-zinc-200" : v > 0 ? "text-emerald-400" : "text-red-400");

/** The user's MT5 accounts; each has its own settings, Start/Stop and history. */
function AccountSwitcher({ accounts, current }: { accounts: View["accounts"]; current: string }) {
  const { t } = useViewer();
  if (accounts.length === 0) return null;
  return (
    <section className="card" aria-labelledby="accounts-title">
      <h2 id="accounts-title" className="card-title">{t("MT5 данс", "MT5 accounts")}</h2>
      <ul className="flex flex-wrap gap-2">
        {accounts.map((a) => {
          const here = a.login === current;
          return (
            <li key={a.login}>
              <a href={`/bot?account=${encodeURIComponent(a.login)}`} aria-current={here ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors ${here ? "border-amber-400 bg-zinc-800 font-semibold text-zinc-50" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
                <Station tone={a.online ? "on" : "off"} />
                <span className="tabular-nums">{a.label}</span>
                {a.mode === "REAL" && <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-400">{t("Жинхэнэ", "Real")}</span>}
                {a.state === "RUNNING" && <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">{t("ажиллаж байна", "running")}</span>}
                <span className="sr-only">{a.online ? t("холбогдсон", "connected") : t("холбогдоогүй", "not connected")}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 max-w-prose text-xs leading-relaxed text-zinc-500">{t("Өөр данс нэмэхдээ MT5 дээр тэр дансаар нэвтэрнэ (File → Login to Trade Account). Робот вэбтэй холбогдмогц данс энд гарч ирнэ, анх зогссон төлөвтэй байна. Нэг MT5 нэг удаад нэг дансанд л нэвтэрдэг тул хоёр дансыг зэрэг ажиллуулахад хоёр тусдаа MT5 хэрэгтэй.", "To add another account, sign in to it in MT5 (File → Login to Trade Account). It appears here as soon as the robot reaches the web, and starts out stopped. One MT5 is signed in to one account at a time, so running two accounts at once needs two separate MT5 installations.")}</p>
    </section>
  );
}

const signedMoney = (v: number | null) => (v === null ? "—" : <>{v !== 0 && <><Dir d={v} />{" "}</>}{signedUsd(v)}</>);

export function BotPanel({ initial, syncUrl, robot, setup }: { initial: View; syncUrl: string; robot: RobotNeeds; setup: SetupToolText }) {
  const who = useViewer();
  const { t, ub, zone } = who;
  const latestFile = robotFileLabel(robot.latest);
  const STOP_REASON = stopReasons(t, latestFile), TOOLS = toolList(t), BLOCK = blockReasons(t, `${ub("08:00")} (${zone})`);
  const [v, setV] = useState<View>(initial);
  const [stale, setStale] = useState(false);
  const [cfgState, cfgAction, cfgPending] = useActionState<BotFormState, FormData>(saveBotConfigAction, {});
  const [tokState, tokAction, tokPending] = useActionState<BotFormState, FormData>(rotateTokenAction, {});
  const [gateState, gateAction, gatePending] = useActionState<BotFormState, FormData>(saveGateAction, {});

  // Every 2 s while the tab is in view, one request at a time; the server-rendered view covers the first paint.
  const load = useCallback(() =>
    fetch(`/api/bot/status?account=${encodeURIComponent(initial.account)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: View) => { setV(d); setStale(false); })
      .catch(() => setStale(true)), [initial.account]);
  usePoll(load, 2000, true, false);

  const running = v.state === "RUNNING";
  const real = v.accountMode === "REAL";
  const c = v.config;
  const [tool, setTool] = useState(c.mode === "SCALPER" ? "DAY" : c.mode); // the scalper is retired
  const basket = tool === "BASKET";
  const reading = tool === "READING";
  const day = tool === "DAY";
  const asian = tool === "ASIAN";
  const exposure = (basket ? c.basket.lots * c.basket.count : asian || reading || day ? c.rule.lots : c.lots * c.maxPositions) * 100; // $ per $1 move in gold
  const spread = v.bid !== null && v.ask !== null && v.ask > v.bid ? v.ask - v.bid : null;
  const needVersion = robot.need[tool] ?? robot.latest;
  const needFile = robotFileLabel(needVersion);
  const oldRobot = (v.robotVersion ?? (v.online ? 1 : needVersion)) < needVersion;
  const g = c.gate;
  const savedTool = (TOOLS.find(([id]) => id === c.mode) ?? TOOLS[0])[1]; // a bot still on the retired scalper shows as the day trader it will start as

  const accountField = <input type="hidden" name="account" value={v.account} />;
  const section = "text-[15px] font-semibold text-zinc-100";

  return (
    <div className="space-y-4 sm:space-y-5">
      <AccountSwitcher accounts={v.accounts} current={v.account} />
      {real && (
        <div role="alert" className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-300 sm:px-5">
          <strong>{t("ЖИНХЭНЭ ДАНС холбогдсон байна.", "A REAL ACCOUNT is connected.")}</strong> {t("Бот энэ дансан дээр жинхэнэ мөнгөөр арилжаа хийнэ", "The bot will trade real money on this account")}{c.allowReal ? "" : t(" — гэхдээ “Жинхэнэ данс” сонголт унтраалттай тул Start дарсан ч ажиллахгүй", " — but the “Real account” option is off, so it will not run even if you press Start")}.
        </div>
      )}

      <section className="card" aria-label={t("Ботын төлөв", "Bot status")}>
        {/* The run state as a status line: a filled station while running, a hollow one when stopped. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`inline-flex items-center gap-2.5 text-lg font-bold ${running ? "text-emerald-400" : "text-zinc-200"}`}>
            <Station tone={running ? "on" : "off"} />
            {running ? t("Бот ажиллаж байна", "Bot is running") : t("Бот зогссон", "Bot is stopped")}
          </span>
          <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-300">{savedTool}</span>
          {!running && v.stopReason && <span className="text-sm text-zinc-400">({STOP_REASON[v.stopReason] ?? v.stopReason})</span>}
        </div>
        <p className={`mt-2 flex items-center gap-2 text-xs ${v.online ? "text-zinc-400" : "text-amber-300"}`}>
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${v.online ? "bg-emerald-400" : "border-2 border-amber-400"}`} />
          <span>MT5: <span className={v.online ? "font-medium text-emerald-400" : "font-medium"}>{v.online ? t("холбогдсон", "connected") : v.lastSeenAt ? t("холболт тасарсан", "connection lost") : t("холбогдоогүй", "not connected")}</span>{stale ? t(" · самбар шинэчлэгдэхгүй байна", " · the panel is not updating") : ""}</span>
        </p>
        <div className="mt-4">
          <Figures inset className="grid-cols-2 sm:grid-cols-4" items={[
            { label: t("Данс", "Account"), value: v.accountMode ? `${v.accountMode === "REAL" ? t("Жинхэнэ", "Real") : "Demo"} ${v.accountLogin ?? ""}${v.accountServer ? ` · ${v.accountServer}` : ""}` : "—", tone: `text-sm sm:text-base ${real ? "text-red-300" : "text-zinc-100"}` },
            { label: t("Үлдэгдэл (Balance)", "Balance"), value: money(v.balance) },
            { label: t("Хөрөнгө (Equity)", "Equity"), value: money(v.equity) },
            { label: t("Сүүлийн 24ц", "Last 24h"), value: signedMoney(v.pnl24h), tone: tone(v.pnl24h) },
          ]} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={startBotAction} className="max-sm:flex-1">{accountField}<button className="btn w-full px-6" disabled={running || !v.hasToken}>{t("Ботыг эхлүүлэх", "Start bot")}</button></form>
          <form action={stopBotAction} className="max-sm:flex-1">{accountField}<button className="btn-ghost w-full px-6" disabled={!running}>{t("Зогсоох", "Stop")}</button></form>
          <form action={closeAllAction} className="max-sm:w-full">{accountField}<button className="btn-ghost w-full text-red-400" disabled={v.positions.length === 0}>{t("Бүгдийг хаах", "Close all")}</button></form>
          {v.closeAllPending && <span className="self-center text-xs font-medium text-amber-300">{t("Арилжаануудыг хааж байна…", "Closing trades…")}</span>}
        </div>
        {!v.online && <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-300">{t("MT5 робот холбогдоогүй үед Start дарсан ч арилжаа хийгдэхгүй. Робот холбогдмогц тушаалыг авна.", "While the MT5 robot is not connected, pressing Start places no trades. The robot picks up the command as soon as it connects.")}</p>}
      </section>

      <div className="grid items-start gap-4 sm:gap-5 md:grid-cols-2">
        <section className="card" aria-labelledby="now-h">
          <h2 id="now-h" className="card-title">{t("Одоо", "Now")}</h2>
          <div className={`flex items-baseline gap-2 text-3xl font-bold tracking-[-0.02em] ${v.signal === "BUY" ? "text-emerald-400" : v.signal === "SELL" ? "text-red-400" : "text-zinc-200"}`}>
            {v.signal === "BUY" || v.signal === "SELL" ? <Dir d={v.signal === "BUY" ? 1 : -1} /> : null}
            {v.signal === "BUY" ? "BUY" : v.signal === "SELL" ? "SELL" : v.signal === "NONE" ? t("Хүлээж байна", "Waiting") : "—"}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{v.reason || t("Роботоос мэдээлэл ирээгүй", "No data from the robot yet")}</p>
          <p className="mt-2 text-xs text-zinc-500 tabular-nums">{v.symbol ?? "—"}, bid {v.bid ?? "—"}, ask {v.ask ?? "—"}</p>
          {v.gateOn !== null && (
            <div className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3 text-sm">
              {/* The entry filter's verdict, as the robot reports it on every sync. */}
              <p className="flex items-start gap-2.5">
                <Station tone={!v.gateOn ? "off" : v.block ? "warn" : "on"} className="mt-1 shrink-0" />
                <span className="leading-relaxed">
                  {!v.gateOn ? <span className="text-amber-300">{t("Орох шүүлтүүр унтраалттай: бот дохио бүрт шууд орно.", "The entry filter is off: the bot enters on every signal.")}</span>
                    : v.block ? <><span className="font-semibold text-zinc-100">{t("Орохгүй байгаа шалтгаан:", "Why it is not entering:")}</span> <span className="text-amber-300">{BLOCK[v.block] ?? v.block}</span>{v.blockDetail ? <span className="text-zinc-500 tabular-nums"> ({v.blockDetail})</span> : null}</>
                    : <span className="text-zinc-300">{t("Шүүлтүүр нээлттэй: нөхцөл бүрдсэн дохио гармагц орно.", "The filter passes: it enters when a signal meets every condition.")}</span>}
                </span>
              </p>
              {v.tradesToday !== null && (
                <p className="text-xs text-zinc-400 tabular-nums">
                  {t(`Өнөөдөр (${ub("08:00")}-аас)`, `Today (since ${ub("08:00")})`)}: {v.tradesToday}{g.on && g.maxTradesDay > 0 ? ` / ${g.maxTradesDay}` : ""} {t("оролт", "entries")} · <span className={tone(v.dayPnl)}>{signedMoney(v.dayPnl)}</span>
                  {g.on && g.dailyLossPct > 0 && (v.dailyLossHit
                    ? <span className="font-semibold text-red-400"> · {t(`алдагдлын хязгаар (${g.dailyLossPct}%) хүрсэн`, `loss stop (${g.dailyLossPct}%) reached`)}</span>
                    : <span> · {t(`алдагдлын хязгаар ${g.dailyLossPct}%`, `loss stop at ${g.dailyLossPct}%`)}</span>)}
                </p>
              )}
            </div>
          )}
          {running && <p className="mt-3 border-t border-zinc-800 pt-3 text-sm text-zinc-400">{t("Энэ удаагийн үр дүн:", "This run's result:")} <span className={`font-semibold tabular-nums ${tone(v.runPnl)}`}>{signedMoney(v.runPnl)}</span></p>}
          {running && c.mode === "BASKET" && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              {v.positions.length > 0 ? t(`Багц нээлттэй. ${money(c.basket.profit)} ашигт хүрвэл эсвэл ${money(-c.basket.loss)} алдагдалд хүрвэл бүгдийг зэрэг хаана.`, `Basket open. All trades close together at ${money(c.basket.profit)} profit or ${money(-c.basket.loss)} loss.`) : t("Дохио хүлээж байна. Гармагц багцыг бүхэлд нь нээнэ.", "Waiting for a signal. The whole basket opens as soon as one appears.")}
            </p>
          )}
          {running && c.mode === "DAY" && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{v.positions.length > 0 ? t("Арилжаа нээлттэй. Stop, target эсвэл 24 цагийн дараа хаагдана.", "Trade open. It closes at its stop, its target or after 24 hours.") : t("15 минутын лаа хаагдах бүрд setup хайж байна. Sweep → MSS → FVG → хариу үйлдэл бүрдэж, дүгнэлт таарвал орно.", "Looking for a setup at every 15-minute close. It enters when sweep → shift → FVG → reaction lines up and the reading agrees.")}</p>
          )}
          {running && c.mode === "READING" && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{v.positions.length > 0 ? t("Арилжаа нээлттэй. Stop эсвэл target-аараа хаагдана.", "Trade open. It closes at its stop or its target.") : t("Дүгнэлтийг 15 минут тутам шалгаж байна. Хангалттай олон арга нэг чиглэл заахад орно.", "Checking the reading every 15 minutes. It enters when enough methods point one way.")}</p>
          )}
          {running && c.mode === "ASIAN" && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{v.positions.length > 0 ? t("Арилжаа нээлттэй. Stop, target эсвэл тухайн setup-ийн хаах цагт хаагдана (цагийг доор харна уу).", "Trade open. It closes at its stop, its target or its setup's closing time (times below).") : t("Дүрэм ажиллаж байна: 3 setup-ийн хүрээ бүрдэж, хүрээнээс гарахыг хүлээнэ. Stop дартал зогсохгүй.", "The rule is running: it waits for each of the 3 setups' ranges to form and break. It does not stop until you press Stop.")}</p>
          )}
          {running && c.mode === "SCALPER" && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              {v.plannedSeconds ? t(`Ботын тооцсон хугацаа: ${Math.round(v.plannedSeconds)} сек · өнгөрсөн ${Math.round(v.elapsedSeconds ?? 0)} сек`, `Time planned by the bot: ${Math.round(v.plannedSeconds)} s · elapsed ${Math.round(v.elapsedSeconds ?? 0)} s`) : t("Эхний арилжаагаа хүлээж байна — хугацааг орсны дараа тооцно", "Waiting for the first trade — the time is worked out after entry")}
            </p>
          )}
        </section>

        <form action={cfgAction} className="card space-y-4" aria-labelledby="cfg-h">{accountField}
          <h2 id="cfg-h" className="card-title mb-0">{t("Хэрэгсэл ба тохиргоо", "Tool and settings")}</h2>
          <input type="hidden" name="mode" value={tool} />
          {/* The three tools as stops on one line; the chosen one is filled. */}
          <div role="radiogroup" aria-label={t("Ботын хэрэгсэл", "Bot tool")} className="relative">
            <span aria-hidden className="pointer-events-none absolute top-5 bottom-5 left-[17px] z-[1] w-[3px] rounded-full bg-zinc-700" />
            {TOOLS.map(([id, name, about]) => {
              const on = tool === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} disabled={running} onClick={() => setTool(id)}
                  className={`relative flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-zinc-800" : "hover:bg-zinc-800/60"}`}>
                  <Station tone={on ? "now" : "off"} className="relative z-10 mt-1" />
                  <span className="min-w-0">
                    <span className={`flex flex-wrap items-center gap-2 font-semibold ${on ? "text-zinc-50" : "text-zinc-200"}`}>
                      {name}
                      {id !== "ASIAN" && id !== "READING" && id !== "DAY" && <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">{t("туршилтын", "experimental")}</span>}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">{about}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {oldRobot && (
            <p role="alert" className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              {needFile ? t(`MT5 дээрх роботын файл энэ хэрэгсэлд хуучин (${needFile}-аас өмнөх) тул бот эхлэхгүй.`, `The robot file on MT5 is too old for this tool (older than ${needFile}), so the bot will not start.`) : t("MT5 дээрх роботын файл энэ хэрэгсэлд хуучин тул бот эхлэхгүй.", "The robot file on MT5 is too old for this tool, so the bot will not start.")} <a className="font-semibold underline" href="/api/bot/download?file=ex5">{t("Шинэ XauBot.ex5", "Download the new XauBot.ex5")}</a>{t("-ийг татаж Experts хавтсанд хуучныг нь дарж хуулаад MT5-аа дахин нээнэ үү.", ", copy it over the old one in the Experts folder and reopen MT5.")}
            </p>
          )}
          <div className="grid grid-cols-2 items-end gap-3 border-t border-zinc-800 pt-4" key={tool}>
            {((asian || reading || day ? [
              ["rLots", t("Лот", "Lots"), c.rule.lots, "0.01"],
            ] : basket ? [
              ["bLots", t("Лот (арилжаа бүрт)", "Lots (per trade)"), c.basket.lots, "0.01"], ["bCount", t("Арилжааны тоо (зэрэг)", "Number of trades (at once)"), c.basket.count, "1"],
              ["bProfit", t("Ашиг $… болмогц хаах", "Close at $… profit"), c.basket.profit, "0.5"], ["bLoss", t("Алдагдал $… болвол хаах", "Close at $… loss"), c.basket.loss, "0.5"],
            ] : [
              ["lots", t("Лот (арилжаа бүрт)", "Lots (per trade)"), c.lots, "0.01"], ["maxPositions", t("Зэрэг нээх арилжаа", "Trades open at once"), c.maxPositions, "1"],
              ["slAtr", "Stop loss (ATR ×)", c.slAtr, "0.1"], ["tpAtr", "Take profit (ATR ×)", c.tpAtr, "0.1"],
              ["profitTarget", t("Ашиг $… хүрвэл зогс", "Stop at $… profit"), c.profitTarget ?? "", "1"], ["maxLoss", t("Алдагдал $… хүрвэл зогс", "Stop at $… loss"), c.maxLoss ?? "", "1"],
            ]) as [string, string, number | string, string][]).map(([name, label, val, step]) => (
              <div key={name}>
                {/lots$/i.test(name)
                  ? <div className="flex items-center gap-1.5"><label className="label" htmlFor={name}>{label}</label><TermHint id="lot" /></div>
                  : <label className="label" htmlFor={name}>{label}</label>}
                <input className="input tabular-nums" id={name} name={name} type="number" inputMode="decimal" step={step} min="0" defaultValue={val} disabled={running} />
              </div>
            ))}
          </div>
          <label className="flex items-start gap-3 text-sm text-zinc-200">
            <input type="checkbox" name="allowReal" defaultChecked={c.allowReal} disabled={running} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" />
            <span>{t("Жинхэнэ данс дээр арилжаа хийхийг зөвшөөрөх", "Allow trading on a real account")} <span className="block text-xs text-zinc-500">{t("Унтраалттай үед бот зөвхөн demo данс дээр ажиллана. MT5 роботын тохиргоонд ч мөн адил сонголтыг асаах ёстой.", "When off, the bot runs only on a demo account. The same option must also be switched on in the MT5 robot's settings.")}</span></span>
          </label>
          {day ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              {t(`Орох дараалал: (1) сүүлийн swing оргил/ёроолыг шүүрдээд буцаж хаагдана, (2) эсрэг талын swing-ийг давж хаагдана (MSS), (3) тэр хөдөлгөөний үлдээсэн FVG, байхгүй бол order block руу буцна, (4) тэндээс буцаж хаагдсан лаа гарна, (5) сайтын аргуудын дор хаяж ${c.gate?.dayLean ?? 2}-оор илүү нь ижил чиглэл заана. Stop ихэвчлэн $5–20 зайтай: жижиг дансанд доорх «Арилжааны хэмжээ ба stop» хэсэгт эрсдэлээ тавина, доод лот багтахгүй бол орохгүй. Долоо хоногт дунджаар 1–2 арилжаа: цөөн боловч шалгуур өндөр.`,
                `The sequence: (1) price sweeps the last swing high or low and closes back, (2) it closes beyond the opposite swing (MSS), (3) it returns to the fair value gap that move left, or the order block if there is none, (4) a candle closes back out of it, (5) at least ${c.gate?.dayLean ?? 2} more of the site's methods read that side than the other. The stop is usually $5–20 away: on a small account set your risk under "Trade size and stop" below; when the minimum lot does not fit, it does not enter. One or two trades a week on average: few, with a high bar.`)}
              {" "}<span className="text-amber-300">{t("3 жилийн 15 минутын лаан дээр шалгасан ($0.30 зардалтай). Хэв маяг дангаараа ашиггүй байсан (Profit Factor 0.85–1.08). Дүгнэлттэй таарсан үед л: эхний 70%-д 161 арилжаа, 45% ашигтай, PF 1.37; сүүлийн 30%-д 55 арилжаа, 45%, PF 1.49. Дүгнэлтийн эсрэг орсон нь алдсан (PF 0.51–0.95). Хязгаар: лааны дата дээрх тооцоо, бодит арилжаа биш; олон хувилбараас сонгосон тул бодит үр дүн үүнээс доогуур байх магадлалтай. Эхлээд demo дансаар.",
                "Checked on three years of 15-minute candles (with $0.30 cost). On its own the pattern showed no edge (Profit Factor 0.85–1.08). Only when the reading agreed: 161 trades in the first 70%, 45% won, PF 1.37; 55 trades in the last 30%, 45%, PF 1.49. Entries against the reading lost (PF 0.51–0.95). Limits: a calculation on candle data, not real trading; it was picked from several variants, so real results are likely to be lower. Demo account first.")}</span>
            </p>
          ) : reading ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              {t(`Орох чиглэлийг дор хаяж ${(c.gate?.minAgree ?? 0) > 0 ? c.gate.minAgree : 9} арга дэмжиж, эсрэг талаасаа олон байх үед орно (тоог доорх «Санал нийлэх арга» талбараас өөрчилнө). Stop нь 1 цагийн ATR-аас тооцогддог тул ихэвчлэн $10–25 зайтай: 0.01 лотод нэг арилжааны алдагдал тэр хэмжээний доллар. Жижиг дансанд энэ их тул «Арилжааны хэмжээ ба stop» хэсэгт эрсдэлээ $ эсвэл %-иар тавина; доод лот багтахгүй бол робот орохгүй.`,
                `It enters when at least ${(c.gate?.minAgree ?? 0) > 0 ? c.gate.minAgree : 9} methods back the side and outnumber the other (change the number in "Methods that must agree" below). The stop comes from the 1-hour ATR, so it is usually $10–25 away: at 0.01 lots a losing trade costs about that many dollars. That is a lot for a small account, so set your risk in $ or % under "Trade size and stop"; when the minimum lot does not fit, the robot does not enter.`)}
              {" "}<span className="text-amber-300">{t("Арилжааны талаас илүү нь алдагдалтай хаагдах нь энд хэвийн: ашиг нь ялалт алдагдлаас 2 дахин том байдгаас гардаг. Дүгнэлтийн эсрэг хэзээ ч орохгүй. Өнгөрсөн датан дээрх тооцоо ирээдүйд давтагдах баталгаагүй; эхлээд demo дансаар.",
                "More than half the trades closing at a loss is normal here: the profit comes from wins being twice the size of losses. It never trades against the reading. Calculations on past data are no guarantee they repeat; demo account first.")}</span>
            </p>
          ) : asian ? (
            <div className="space-y-2 text-xs leading-relaxed text-zinc-400">
              <p>{t(`Өдөрт 3 хүртэл арилжаа (setup бүрт нэг), тус бүр ${c.rule.lots.toFixed(2)} лот: алт $1 хөдлөхөд арилжаа бүрт ±${money(exposure)}. Stop хүрээний дунд. Цаг ${zone}-аар:`, `Up to 3 trades a day (one per setup), each at ${c.rule.lots.toFixed(2)} lots: ±${money(exposure)} per trade for every $1 gold moves. The stop is the middle of the range. Times in ${zone}:`)}</p>
              <ul className="list-disc space-y-1 pl-4">{setup.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              <p className="text-amber-300">{setup.record ? `${recordSentence(setup.record, t)} ` : ""}{t("MT5 болон Windows компьютер эсвэл VPS асаалттай үед л ажиллана.", "It works only while MT5 and the Windows computer or VPS are on.")}</p>
            </div>
          ) : basket ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              {t(`Хадгалсан тохиргоогоор ${c.basket.count} арилжаа, нийт ${(c.basket.lots * c.basket.count).toFixed(2)} лот зэрэг нээгдэнэ: алт $1 хөдлөхөд ±${money(exposure)}.`,
                `With the saved settings ${c.basket.count} trades open at once, ${(c.basket.lots * c.basket.count).toFixed(2)} lots in total: ±${money(exposure)} for every $1 gold moves.`)}
              {" "}{t(`Ашигт хүрэхийн тулд алт ойролцоогоор $${(c.basket.profit / exposure + (spread ?? 0)).toFixed(2)} таатай тийш, алдагдлын хязгаарт хүрэхэд $${Math.max(c.basket.loss / exposure - (spread ?? 0), 0).toFixed(2)} эсрэг тийш хөдөлнө`,
                `To reach the profit, gold has to move about $${(c.basket.profit / exposure + (spread ?? 0)).toFixed(2)} in your favour; to reach the loss limit, $${Math.max(c.basket.loss / exposure - (spread ?? 0), 0).toFixed(2)} against you`)}
              {spread !== null ? t(` (одоогийн spread $${spread.toFixed(2)} орсон; багц нээгдэх мөчид ${money(-spread * exposure)}-оос эхэлнэ).`, ` (the current spread of $${spread.toFixed(2)} is included; the basket starts at ${money(-spread * exposure)} the moment it opens).`) : t(" (spread орохгүйгээр).", " (not counting the spread).")}
              {" "}{t("Хугацааны хязгаар байхгүй: аль нэг дүнд хүртэл нээлттэй байна. Арилжаа бүрт алдагдлын хязгаараас 2 дахин хол аваарын stop тавигдана (компьютер унтарсан үед).", "There is no time limit: it stays open until one of the amounts is reached. Each trade also carries an emergency stop twice as far as the loss limit (for when the computer goes off).")}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-zinc-400">{t(`Хадгалсан тохиргоогоор хамгийн ихдээ ${(c.lots * c.maxPositions).toFixed(2)} лот нээгдэнэ: алт $1 хөдлөхөд ±${money(exposure)}, $10 хөдлөхөд ±${money(exposure * 10)}. Хоосон орхисон зогсох нөхцөл үйлчлэхгүй. Хэр удаан ажиллахаа бот өөрөө тооцно.`, `With the saved settings at most ${(c.lots * c.maxPositions).toFixed(2)} lots are open: ±${money(exposure)} for every $1 gold moves, ±${money(exposure * 10)} for $10. A stop condition left empty does not apply. The bot works out how long to run.`)}</p>
          )}
          {cfgState.error && <p role="alert" className="text-sm text-red-400">{cfgState.error}</p>}
          {cfgState.ok && <p role="status" className="text-sm text-emerald-400">{cfgState.ok}</p>}
          <button className="btn" disabled={running || cfgPending}>{running ? t("Ажиллаж байх үед өөрчлөхгүй", "Cannot be changed while running") : t("Хадгалах", "Save")}</button>
        </form>
      </div>

      <form action={gateAction} className="card space-y-4" aria-labelledby="gate-h">{accountField}
        <div>
          <h2 id="gate-h" className="card-title mb-1">{t("Орох шүүлтүүр", "Entry filter")}</h2>
          <p className="max-w-prose text-xs leading-relaxed text-zinc-400">{t("Day trader, Дүгнэлт, Багц хэрэгслүүд арилжаа нээхээс өмнө эдгээр нөхцөлийг давна: бот цөөн, илүү нөхцөл бүрдсэн үед л орно. Setup дохио нь Setup хуудасны дүрмийг яг дагадаг тул энэ шүүлтүүр түүнд үйлчлэхгүй. Тоог 0 болговол тэр шалгалт унтарна. Хадгалсны дараагийн оролтоос үйлчилнэ.", "The Day trader, Reading and Basket tools must pass these checks before opening a trade, so the bot enters less often and only when more conditions line up. Setup signals follows the Setup page's rules exactly, so this filter does not apply to it. Set a number to 0 to switch that check off. Changes apply from the next entry.")}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--hairline)" }}>
          <p className="text-sm font-semibold text-zinc-100">{t("Бэлэн тохиргоо", "Ready-made settings")}</p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-zinc-400">{t("Нэг товчоор бүх талбарыг бөглөж хадгална. Дараа нь доорх талбаруудаас хүссэнээ өөрчилж болно. Гурвуулаа балансын хувиар хэмжээгээ тооцож, ашигтай арилжааг хамгаална.", "One press fills and saves every field below; change any of them afterwards. All three size by percent of balance and protect a winning trade.")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              ["CAREFUL", t("Болгоомжтой", "Careful"), t("10+ арга · өдөрт 3 · эрсдэл 1%", "10+ methods · 3 a day · 1% risk")],
              ["BALANCED", t("Дунд", "Balanced"), t("9+ арга · өдөрт 5 · эрсдэл 2%", "9+ methods · 5 a day · 2% risk")],
              ["ACTIVE", t("Идэвхтэй", "Active"), t("8+ арга · өдөрт 8 · эрсдэл 3%", "8+ methods · 8 a day · 3% risk")],
            ] as const).map(([id, name, sub]) => (
              <button key={id} name="preset" value={id} disabled={gatePending} className="rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-50" style={{ borderColor: "var(--hairline)" }}>
                <span className="block text-sm font-semibold text-zinc-100">{name}</span>
                <span className="mt-0.5 block text-xs text-zinc-400">{sub}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 text-sm text-zinc-200">
            <input type="checkbox" name="gOn" defaultChecked={g.on} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" />
            <span>{t("Шүүлтүүр асаалттай", "Filter on")} <span className="block text-xs text-zinc-500">{t("Унтраавал доорх бүх шалгалт, өдрийн хязгаар ч унтарна.", "Off switches every check below off, the daily limits too.")}</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm text-zinc-200">
            <input type="checkbox" name="gTrend" defaultChecked={g.trend} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" />
            <span>{t("Дээд хугацааны тренд таарах", "Higher-timeframe trend must agree")} <span className="block text-xs text-zinc-500">{t("BUY: H1 ба M15 дээр EMA20 нь EMA50-аас дээш. SELL: эсрэгээр.", "BUY: EMA20 above EMA50 on both H1 and M15. SELL: the reverse.")}</span></span>
          </label>
        </div>
        <fieldset className="rounded-2xl border p-4" style={{ borderColor: "var(--hairline)" }}>
          <legend className="px-1 text-sm font-semibold text-zinc-100">{t("Арилжааны хэмжээ ба stop", "Trade size and stop")}</legend>
          <p className="max-w-prose text-xs leading-relaxed text-zinc-400">{t("Ямар ч хэмжээний дансанд тохирно: арилжаа бүрт алдаж болох дүнгээ хэлэхэд робот stop-ийн зайнаас лотоо өөрөө тооцно. Жижиг дансанд тооцсон лот брокерын доод лотоос (ихэвчлэн 0.01) бага гарвал робот stop-оо ойртуулж доод лотоор орно; stop хэт ойр болох бол тэр арилжаанд орохгүй.", "Fits an account of any size: say how much one trade may lose and the robot works out the lots from the stop distance. On a small account, when the lots come out below the broker's minimum (usually 0.01), the robot moves the stop closer and enters with the minimum; if the stop would be too close it skips that trade.")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="gRiskMode">{t("Хэмжээг тогтоох арга", "How to size a trade")}</label>
              <select className="input" id="gRiskMode" name="gRiskMode" defaultValue={g.riskMode ?? "LOTS"}>
                <option value="LOTS">{t("Тогтмол лот (хэрэгслийн талбараас)", "Fixed lots (from the tool's field)")}</option>
                <option value="USD">{t("Арилжаа бүрт $ дүн", "Dollars per trade")}</option>
                <option value="PCT">{t("Балансын хувь", "Percent of balance")}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="gRiskVal">{t("Эрсдэл ($ эсвэл %)", "Risk ($ or %)")}</label>
              <input className="input tabular-nums" id="gRiskVal" name="gRiskVal" type="number" inputMode="decimal" step="0.1" min="0" defaultValue={g.riskValue || ""} placeholder={t("жишээ: 10", "e.g. 10")} />
            </div>
          </div>
          <label className="mt-3 flex items-start gap-3 text-sm text-zinc-200">
            <input type="checkbox" name="gProtect" defaultChecked={g.protect ?? false} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" />
            <span>{t("Ашигтай арилжааг хамгаалах", "Protect a winning trade")} <span className="block text-xs text-zinc-500">{t("Ашиг эрсдэлийн хэмжээнд (+1R) хүрэхэд stop-ийг орсон үнэ рүү зөөж алдагдалгүй болгоно; +1.5R-ээс хойш үнийг 1R зайтай дагуулна. Day trader болон Дүгнэлт хэрэгсэлд ажиллана; Setup дохио болон Багц өөрийн дүрмээр хаагдана.", "When profit reaches the size of the risk (+1R) the stop moves to the entry price, so the trade can no longer lose; from +1.5R it trails the price at a distance of 1R. Works for the Day trader and Reading tools; Setup signals and Basket close by their own rules.")}</span></span>
          </label>
        </fieldset>
        <div className="grid grid-cols-2 items-end gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-4">
          {([
            ["gStart", t("Эхлэх цаг (УБ)", "Start hour (UB)"), g.sessionStartUb, "1", "23"],
            ["gEnd", t("Дуусах цаг (УБ)", "End hour (UB)"), g.sessionEndUb, "1", "23"],
            ["gNewsBefore", t("Мэдээний өмнө, мин", "Minutes before news"), g.newsBeforeMin, "5", "240"],
            ["gNewsAfter", t("Мэдээний дараа, мин", "Minutes after news"), g.newsAfterMin, "5", "240"],
            ["gAtrMin", t("M15 ATR доод, $", "M15 ATR at least, $"), g.atrMin, "0.1", "100"],
            ["gAtrMax", t("M15 ATR дээд, $", "M15 ATR at most, $"), g.atrMax, "0.5", "200"],
            ["gSpreadPct", t("Spread ≤ ATR-ийн %", "Spread ≤ % of ATR"), g.maxSpreadPct, "1", "100"],
            ["gRsiMax", t("RSI(14) хязгаар", "RSI(14) cap"), g.rsiMax, "1", "95"],
            ["gExtAtr", t("EMA20-оос ≤ ATR ×", "From EMA20 ≤ ATR ×"), g.maxExtAtr, "0.1", "20"],
            ["gAgree", t("Санал нийлэх арга (14-өөс)", "Methods that must agree (of 14)"), g.minAgree ?? 8, "1", "16"],
            ["gDayLean", t("Day trader: дүгнэлтийн зөрүү", "Day trader: reading margin"), g.dayLean ?? 2, "1", "10"],
            ["gMaxTrades", t("Өдөрт орох дээд тоо", "Entries a day, at most"), g.maxTradesDay, "1", "100"],
            ["gDailyLoss", t("Өдрийн алдагдал, балансын %", "Daily loss stop, % of balance"), g.dailyLossPct, "0.5", "50"],
          ] as [string, string, number, string, string][]).map(([name, label, val, step, max]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input className="input tabular-nums" id={name} name={name} type="number" inputMode="decimal" step={step} min="0" max={max} defaultValue={val} />
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-zinc-400">
          {t(`Хадгалсан тохиргоогоор ${ub(hh(g.sessionStartUb))}–${ub(hh(g.sessionEndUb))} (${zone}) цагт арилжина. HIGH мэдээнээс ${g.newsBeforeMin} минутын өмнөөс ${g.newsAfterMin} минутын дараа хүртэл, брокерын өдрийн солилтын үед (серверийн 23:45–00:30) шинээр орохгүй. RSI хязгаар 70 бол RSI 70-аас дээш үед BUY, 30-аас доош үед SELL хийхгүй. Өдрийн тоолол ${ub("08:00")}-д шинэчлэгдэнэ.`,
            `With the saved settings it trades ${ub(hh(g.sessionStartUb))}–${ub(hh(g.sessionEndUb))} (${zone}). It opens nothing new from ${g.newsBeforeMin} minutes before a HIGH-impact release to ${g.newsAfterMin} minutes after it, nor during the broker's daily rollover (23:45–00:30 server time). An RSI cap of 70 means no BUY above RSI 70 and no SELL below 30. The daily count restarts at ${ub("08:00")}.`)}
        </p>
        <p className="text-xs leading-relaxed text-amber-300">{t("Шүүлтүүр нь муу нөхцөлд орохоос сэргийлэх зорилготой; ботыг ашигтай болгоно гэсэн баталгаа биш. Тохиргоо бүрийг MT5-ийн Strategy Tester (TesterGate… input-ууд) болон demo дансан дээр шалгаж байж жинхэнэ мөнгө тавина.", "The filter is meant to keep the bot out of poor conditions; it does not make the bot profitable. Check any setting in the MT5 Strategy Tester (the TesterGate… inputs) and on a demo account before putting real money on it.")}</p>
        {gateState.error && <p role="alert" className="text-sm text-red-400">{gateState.error}</p>}
        {gateState.ok && <p role="status" className="text-sm text-emerald-400">{gateState.ok}</p>}
        <button className="btn" disabled={gatePending}>{t("Шүүлтүүр хадгалах", "Save filter")}</button>
      </form>

      {c.mode === "DAY" || tool === "DAY" ? (
        <section className="card" aria-labelledby="day-h">
          <h2 id="day-h" className="card-title mb-1">{t("Day trader-ийн сүүлийн setup-ууд ба шалтгаан", "The day trader's latest setups, and why")}</h2>
          <p className="max-w-prose text-xs leading-relaxed text-zinc-400">{t("Хэв маяг бүрдэх бүрд энд гарна. «Орсон» гэдэг нь дүгнэлт таарч роботод дохио очсон, «алгассан» нь аргууд хангалттай дэмжээгүй гэсэн үг.", "Each time the pattern completes it appears here. \"Sent\" means the reading agreed and the robot was told; \"skipped\" means the methods did not back it enough.")}</p>
          {v.day.recent.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">{t("Сүүлийн 4 хоногт бүрдсэн setup алга.", "No setup has completed in the last four days.")}</p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--hairline)" }}>
              {v.day.recent.map((s) => {
                const known = s.total > 0, ok = known && s.lean >= (c.gate?.dayLean ?? 2);
                const at = new Date(s.at), sweep = new Date(s.sweepAt), shift = new Date(s.shiftAt);
                return (
                  <li key={s.id} className="py-3 text-sm" style={{ borderColor: "var(--hairline)" }}>
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <SidePill side={s.side} />
                      <span className="font-medium text-zinc-100 tabular-nums">{who.dateTime(at)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${!known ? "bg-white/[0.06] text-zinc-400" : ok ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-400/15 text-amber-300"}`}>
                        {!known ? t("дүгнэлт бүртгэгдээгүй", "reading not recorded") : ok ? t("орсон", "sent") : t("алгассан", "skipped")}
                      </span>
                    </p>
                    <p className="mt-1.5 leading-relaxed text-zinc-400">
                      {t(`${who.time(sweep)}-д ${s.level.toFixed(2)} түвшний liquidity-г шүүрдсэн → ${who.time(shift)}-д бүтэц эвдсэн (MSS) → ${s.zone.kind} ${s.zone.bottom.toFixed(2)}–${s.zone.top.toFixed(2)} руу буцаж хариу үйлдэл үзүүлсэн.`,
                        `Swept the liquidity at ${s.level.toFixed(2)} at ${who.time(sweep)} → shifted structure (MSS) at ${who.time(shift)} → returned to the ${s.zone.kind} ${s.zone.bottom.toFixed(2)}–${s.zone.top.toFixed(2)} and reacted.`)}
                      {" "}{known ? t(`Тэр мөчид ${s.total} аргын ${s.buy} нь өсөх, ${s.sell} нь унах гэж уншсан (зөрүү ${s.lean > 0 ? "+" : ""}${s.lean}).`, `At that moment ${s.buy} of ${s.total} methods read up and ${s.sell} down (margin ${s.lean > 0 ? "+" : ""}${s.lean}).`) : ""}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 tabular-nums">{t("Орох", "Entry")} {s.entry.toFixed(2)} · stop {s.stop.toFixed(2)} (${s.risk.toFixed(2)}) · target {s.target.toFixed(2)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section className="card" aria-labelledby="entry-h">
        <h2 id="entry-h" className="card-title mb-1">{t("Ямар нөхцөлд орсон арилжаа хэрхэн дууссан бэ", "How trades ended, by the conditions at entry")}</h2>
        <p className="max-w-prose text-xs leading-relaxed text-zinc-400">{t("Робот арилжаа нээх бүрд сайтын 16 аргын хэд нь тэр чиглэлийг дэмжиж байсныг хадгална. Хаагдсан арилжаануудыг тэр тоогоор бүлэглэв. Цөөн арилжаанаас дүгнэлт хийж болохгүй: 30-аас дээш болтол чиг хандлага гэж бүү үз.", "Each time the robot opens a trade, the site keeps how many of its 16 methods backed that side. Closed trades are grouped by that number. Few trades prove nothing: do not read a pattern into fewer than 30.")}</p>
        {v.entryStats.trades === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">{t("Одоогоор бүртгэгдсэн хаагдсан арилжаа алга. Робот арилжаа хийж эхэлмэгц энд гарна.", "No closed trades recorded yet. They appear here once the robot has traded.")}</p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {([[t("Дэмжсэн аргын тоогоор", "By methods backing the side"), v.entryStats.byBacking, (k: string) => k === "NONE" ? t("дүгнэлтгүй", "no reading") : t(`${k} арга`, `${k} methods`)], [t("Сешнээр", "By session"), v.entryStats.bySession, (k: string) => sessionLabel(k, t)]] as const).map(([title, rows, label]) => (
              <table key={title} className="w-full text-sm">
                <caption className="pb-1 text-left text-xs font-semibold text-zinc-300">{title}</caption>
                <thead><tr className="text-xs text-zinc-500"><th className="py-1 text-left font-medium">{t("Бүлэг", "Group")}</th><th className="py-1 text-right font-medium">{t("Арилжаа", "Trades")}</th><th className="py-1 text-right font-medium">{t("Ашигтай", "Won")}</th><th className="py-1 text-right font-medium">P&L</th></tr></thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.key} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                      <td className="py-1.5 text-zinc-200">{label(b.key)}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-300">{b.trades}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-300">{Math.round((b.wins / b.trades) * 100)}%</td>
                      <td className="py-1.5 text-right"><Pnl value={b.pnl} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        )}
      </section>

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
        <section className="table-card" aria-labelledby="open-h">
          <h2 id="open-h" className={`px-4 pt-4 pb-2 sm:px-5 sm:pt-5 ${section}`}>{t("Нээлттэй арилжаа (", "Open trades (")}{v.positions.length})</h2>
          {v.positions.length === 0 ? <p className="px-4 pb-4 text-sm text-zinc-500 sm:px-5 sm:pb-5">{t("Алга", "None")}</p> : (
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-zinc-800">{["", t("Лот", "Lots"), t("Орсон", "Entry"), "SL", "TP", "P&L"].map((h) => <th key={h} className={`th ${h === "SL" || h === "TP" ? "hidden sm:table-cell" : ""} ${h === "" ? "" : "text-right"}`}>{h}</th>)}</tr></thead>
              <tbody>{v.positions.map((p) => (
                <tr key={p.ticket} className="border-t border-zinc-800/70 first:border-t-0">
                  <td className="td"><SidePill side={p.side} /></td>
                  <td className="td text-right tabular-nums">{p.lots}</td><td className="td text-right tabular-nums">{p.openPrice}</td>
                  <td className="td hidden text-right text-zinc-400 tabular-nums sm:table-cell">{p.sl || "—"}</td><td className="td hidden text-right text-zinc-400 tabular-nums sm:table-cell">{p.tp || "—"}</td>
                  <td className="td text-right"><Pnl value={p.profit} /></td>
                </tr>))}</tbody>
            </table>
          )}
        </section>
        <section className="table-card" aria-labelledby="hist-h">
          <h2 id="hist-h" className={`px-4 pt-4 pb-2 sm:px-5 sm:pt-5 ${section}`}>{t("Арилжааны түүх", "Trade history")} <span className="text-sm font-normal text-zinc-500">{t("(сүүлийн 50, нийт", "(last 50, total")} {v.dealCount})</span></h2>
          {v.deals.length === 0 ? <p className="px-4 pb-4 text-sm text-zinc-500 sm:px-5 sm:pb-5">{t("Хаагдсан арилжаа алга", "No closed trades")}</p> : (
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-zinc-800">{([[`${t("Хаагдсан", "Closed")} (${zone})`, ""], ["", ""], [t("Лот", "Lots"), "text-right"], [t("Орсон", "Entry"), "hidden sm:table-cell text-right"], [t("Гарсан", "Exit"), "hidden sm:table-cell text-right"], ["P&L", "text-right"]] as const).map(([h, cls]) => <th key={h} className={`th ${cls}`}>{h}</th>)}</tr></thead>
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
      </div>

      <form action={tokAction} className="card space-y-3" aria-labelledby="tok-h">
        <h2 id="tok-h" className={section}>{t("MT5 роботыг холбох", "Connect the MT5 robot")}</h2>
        <p className="text-sm text-zinc-300">{t("Роботын тохиргоонд энэ хаягийг оруулна:", "Enter this address in the robot's settings:")}</p>
        <code className="block rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm break-all text-zinc-200">{syncUrl}</code>
        {tokState.token ? (
          <>
          <p className="text-sm text-amber-300">{t("Шинэ токен (дахин харагдахгүй, одоо хуулж ав):", "New token (shown only once, copy it now):")} <code className="mt-1 block rounded-lg border border-amber-400/40 bg-zinc-950 px-3 py-2 break-all text-amber-300 select-all">{tokState.token}</code></p>
          {/* One file with the address and this token: MT5 loads it into the robot's Inputs, so nothing is typed by hand. */}
          <button type="button" className="btn-ghost" onClick={() => {
            const text = `ServerUrl=${syncUrl}\r\nBotToken=${tokState.token}\r\n`;
            const bytes = new Uint8Array(2 + text.length * 2);
            bytes[0] = 0xff; bytes[1] = 0xfe; // UTF-16LE, the encoding MT5 writes its .set files in
            for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); bytes[2 + i * 2] = c & 0xff; bytes[3 + i * 2] = c >> 8; }
            const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
            const link = document.createElement("a");
            link.href = url; link.download = "XauBot.set"; link.click();
            URL.revokeObjectURL(url);
          }}>{t("Тохиргооны файл татах (XauBot.set)", "Download settings file (XauBot.set)")}</button>
          <p className="text-xs leading-relaxed text-zinc-500">{t("MT5 дээр роботыг чарт руу чирээд Inputs таб → Load → энэ файлыг сонгоно. Хаяг болон таны токен өөрөө бөглөгдөнө. Файлыг хэнд ч бүү өг: энэ токен зөвхөн таны бүртгэлд хамаарна.", "In MT5 drag the robot onto the chart, open the Inputs tab → Load → pick this file. The address and your token fill in by themselves. Do not share the file: this token belongs to your account only.")}</p>
          </>
        ) : (
          <p className="text-sm text-zinc-400">{v.hasToken ? t("Токен үүссэн. Шинийг үүсгэвэл хуучин нь хүчингүй болж, роботод шинийг оруулах хэрэгтэй.", "A token exists. Creating a new one cancels the old one, and the new one must be entered in the robot.") : t("Токен үүсээгүй. Эхлээд токен үүсгэнэ.", "No token yet. Create one first.")}</p>
        )}
        <button className="btn-ghost" disabled={tokPending || running}>{v.hasToken ? t("Шинэ токен үүсгэх", "Create a new token") : t("Токен үүсгэх", "Create token")}</button>
      </form>
    </div>
  );
}
