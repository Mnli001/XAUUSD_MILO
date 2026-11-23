"use client";
import { useActionState, useEffect, useState } from "react";
import type { LiveView } from "@/lib/bot/liveDb";
import type { T } from "@/lib/i18n";
import { useViewer } from "./PrefsProvider";
import { Figures, Pnl, SidePill, Station, signedUsd, Dir } from "./Timetable";
import { saveBotConfigAction, startBotAction, stopBotAction, closeAllAction, rotateTokenAction, type BotFormState } from "@/lib/actions/bot";

type View = Omit<LiveView, "startedAt" | "stoppedAt" | "lastSeenAt" | "deals"> & {
  startedAt: string | null; stoppedAt: string | null; lastSeenAt: string | null;
  deals: (Omit<LiveView["deals"][number], "closeTime"> & { closeTime: string })[];
};

const stopReasons = (t: T): Record<string, string> => ({
  MANUAL: t("гараар зогсоосон", "stopped by hand"), TARGET: t("ашгийн зорилтод хүрсэн", "profit target reached"), MAX_LOSS: t("алдагдлын хязгаарт хүрсэн", "loss limit reached"),
  TIME: t("ботын тооцсон хугацаа дууссан", "the time the bot planned has run out"), REVERSAL: t("чиглэл эргэсэн", "direction reversed"), NO_SIGNAL: t("30 минутад дохио гараагүй", "no signal for 30 minutes"),
  REAL_NOT_ALLOWED: t("жинхэнэ данс зөвшөөрөгдөөгүй", "real account not allowed"), NO_ACCESS: t("хандах эрх дууссан", "access expired"),
  OLD_ROBOT: t("MT5 дээрх роботын файл хуучин, Багц хэрэгслийг мэдэхгүй", "the robot file on MT5 is old and does not know the Basket tool"),
});
const toolList = (t: T) => [
  ["SCALPER", "Scalper", t("Нэг нэгээр орно. Арилжаа бүр өөрийн stop, target-тай. Хэр удаан ажиллахаа бот өөрөө тооцно.", "Enters one at a time. Each trade has its own stop and target. The bot works out how long to run.")],
  ["BASKET", t("Багц", "Basket"), t("Дохио гармагц олон арилжааг зэрэг нээнэ. Нийт ашиг таны тавьсан дүнд хүрмэгц бүгдийг зэрэг хаана.", "Opens many trades at once when a signal appears. Closes them all together once total profit reaches your amount.")],
  ["ASIAN", t("Азийн breakout", "Asian breakout"), t("Өдөрт нэг арилжаа: Азийн хүрээнээс өдрийн трендийн чиглэлд гарахад орно. Stop, target, хаах цагийг дүрэм өөрөө тогтооно.", "One trade a day: enters when price leaves the Asian range in the direction of the daily trend. The rule sets the stop, target and closing time.")],
] as const;
const MIN_ROBOT: Record<string, number> = { SCALPER: 1, BASKET: 2, ASIAN: 3 };
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

export function BotPanel({ initial, syncUrl }: { initial: View; syncUrl: string }) {
  const who = useViewer();
  const { t, ub, zone } = who;
  const STOP_REASON = stopReasons(t), TOOLS = toolList(t);
  const [v, setV] = useState<View>(initial);
  const [stale, setStale] = useState(false);
  const [cfgState, cfgAction, cfgPending] = useActionState<BotFormState, FormData>(saveBotConfigAction, {});
  const [tokState, tokAction, tokPending] = useActionState<BotFormState, FormData>(rotateTokenAction, {});

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/bot/status?account=${encodeURIComponent(initial.account)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: View) => { if (alive) { setV(d); setStale(false); } })
        .catch(() => alive && setStale(true));
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [initial.account]);

  const running = v.state === "RUNNING";
  const real = v.accountMode === "REAL";
  const c = v.config;
  const [tool, setTool] = useState(c.mode);
  const basket = tool === "BASKET";
  const asian = tool === "ASIAN";
  const exposure = (basket ? c.basket.lots * c.basket.count : asian ? c.rule.lots : c.lots * c.maxPositions) * 100; // $ per $1 move in gold
  const spread = v.bid !== null && v.ask !== null && v.ask > v.bid ? v.ask - v.bid : null;
  const oldRobot = (v.robotVersion ?? (v.online ? 1 : MIN_ROBOT[tool])) < MIN_ROBOT[tool];
  const savedTool = TOOLS.find(([id]) => id === c.mode)![1];

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
            { label: "Balance", value: money(v.balance) },
            { label: "Equity", value: money(v.equity) },
            { label: t("Сүүлийн 24ц", "Last 24h"), value: signedMoney(v.pnl24h), tone: tone(v.pnl24h) },
          ]} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={startBotAction} className="max-sm:flex-1">{accountField}<button className="btn w-full px-6" disabled={running || !v.hasToken}>Start bot</button></form>
          <form action={stopBotAction} className="max-sm:flex-1">{accountField}<button className="btn-ghost w-full px-6" disabled={!running}>Stop</button></form>
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
          {running && <p className="mt-3 border-t border-zinc-800 pt-3 text-sm text-zinc-400">{t("Энэ удаагийн үр дүн:", "This run's result:")} <span className={`font-semibold tabular-nums ${tone(v.runPnl)}`}>{signedMoney(v.runPnl)}</span></p>}
          {running && c.mode === "BASKET" && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              {v.positions.length > 0 ? t(`Багц нээлттэй. ${money(c.basket.profit)} ашигт хүрвэл эсвэл ${money(-c.basket.loss)} алдагдалд хүрвэл бүгдийг зэрэг хаана.`, `Basket open. All trades close together at ${money(c.basket.profit)} profit or ${money(-c.basket.loss)} loss.`) : t("Дохио хүлээж байна. Гармагц багцыг бүхэлд нь нээнэ.", "Waiting for a signal. The whole basket opens as soon as one appears.")}
            </p>
          )}
          {running && c.mode === "ASIAN" && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{v.positions.length > 0 ? t(`Арилжаа нээлттэй. Stop, target эсвэл ${ub("04:00")} (${zone}) цагт хаагдана.`, `Trade open. It closes at the stop, the target or ${ub("04:00")} (${zone}).`) : t(`Дүрэм ажиллаж байна: өдөр бүр ${ub("15:00")}–${ub("00:00")} (${zone}) цагт breakout хүлээнэ. Stop дартал зогсохгүй.`, `The rule is running: every day it waits for a breakout between ${ub("15:00")} and ${ub("00:00")} (${zone}). It does not stop until you press Stop.`)}</p>
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
                      {id !== "ASIAN" && <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">{t("шалгагдаагүй", "unproven")}</span>}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">{about}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {oldRobot && (
            <p role="alert" className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              {t("MT5 дээрх роботын файл хуучин тул энэ хэрэгсэл ажиллахгүй.", "The robot file on MT5 is old, so this tool will not work.")} <a className="font-semibold underline" href="/api/bot/download?file=ex5">{t("Шинэ XauBot.ex5", "Download the new XauBot.ex5")}</a>{t("-ийг татаж Experts хавтсанд хуучныг нь дарж хуулаад MT5-аа дахин нээнэ үү.", ", copy it over the old one in the Experts folder and reopen MT5.")}
            </p>
          )}
          <div className="grid grid-cols-2 items-end gap-3 border-t border-zinc-800 pt-4" key={tool}>
            {((asian ? [
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
                <label className="label" htmlFor={name}>{label}</label>
                <input className="input tabular-nums" id={name} name={name} type="number" inputMode="decimal" step={step} min="0" defaultValue={val} disabled={running} />
              </div>
            ))}
          </div>
          <label className="flex items-start gap-3 text-sm text-zinc-200">
            <input type="checkbox" name="allowReal" defaultChecked={c.allowReal} disabled={running} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" />
            <span>{t("Жинхэнэ данс дээр арилжаа хийхийг зөвшөөрөх", "Allow trading on a real account")} <span className="block text-xs text-zinc-500">{t("Унтраалттай үед бот зөвхөн demo данс дээр ажиллана. MT5 роботын тохиргоонд ч мөн адил сонголтыг асаах ёстой.", "When off, the bot runs only on a demo account. The same option must also be switched on in the MT5 robot's settings.")}</span></span>
          </label>
          {asian ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              {t(`Өдөрт хамгийн ихдээ нэг арилжаа, ${c.rule.lots.toFixed(2)} лотоор: алт $1 хөдлөхөд ±${money(exposure)}. Хүрээ ${ub("08:00")}–${ub("15:00")} (${zone}); ${ub("15:00")}–${ub("00:00")} цагт өдрийн трендийн чиглэлд хүрээнээс гарч хаагдсан эхний 15 минутын лаагаар орно. Stop хүрээний дунд, target 2 дахин хол, ${ub("04:00")}-д хаана.`,
                `At most one trade a day, at ${c.rule.lots.toFixed(2)} lots: ±${money(exposure)} for every $1 gold moves. The range is ${ub("08:00")}–${ub("15:00")} (${zone}); between ${ub("15:00")} and ${ub("00:00")} it enters on the first 15-minute candle that closes outside the range in the direction of the daily trend. The stop is the middle of the range, the target is twice as far, and it closes at ${ub("04:00")}.`)}
              {" "}<span className="text-amber-300">{t("MT5-ийн Strategy Tester дээр хоёр жилд шалгасан: 2024.11–2025.11-д Profit Factor 1.59 (146 арилжаа, уналт 5.6%), 2025.11–2026.11-д 1.43 (120 арилжаа, уналт 16–22%). 0.01 лотод нэг арилжааны дундаж алдагдал $12–26 байсан. Өнгөрсөн үр дүн ирээдүйг батлахгүй; эхлээд demo дээр ажиллуул. MT5 ба компьютер асаалттай үед л ажиллана.",
                "Tested over two years in the MT5 Strategy Tester: Profit Factor 1.59 in 2024.11–2025.11 (146 trades, drawdown 5.6%) and 1.43 in 2025.11–2026.11 (120 trades, drawdown 16–22%). At 0.01 lots the average losing trade was $12–26. Past results do not guarantee the future; run it on a demo account first. It works only while MT5 and the computer are on.")}</span>
            </p>
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
                  <td className="td font-semibold whitespace-nowrap text-zinc-50 tabular-nums">{who.dateTime(new Date(d.closeTime)).slice(5)}</td>
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
          <p className="text-sm text-amber-300">{t("Шинэ токен (дахин харагдахгүй, одоо хуулж ав):", "New token (shown only once, copy it now):")} <code className="mt-1 block rounded-lg border border-amber-400/40 bg-zinc-950 px-3 py-2 break-all text-amber-300 select-all">{tokState.token}</code></p>
        ) : (
          <p className="text-sm text-zinc-400">{v.hasToken ? t("Токен үүссэн. Шинийг үүсгэвэл хуучин нь хүчингүй болж, роботод шинийг оруулах хэрэгтэй.", "A token exists. Creating a new one cancels the old one, and the new one must be entered in the robot.") : t("Токен үүсээгүй. Эхлээд токен үүсгэнэ.", "No token yet. Create one first.")}</p>
        )}
        <button className="btn-ghost" disabled={tokPending || running}>{v.hasToken ? t("Шинэ токен үүсгэх", "Create a new token") : t("Токен үүсгэх", "Create token")}</button>
      </form>
    </div>
  );
}
