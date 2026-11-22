"use client";
import { useActionState, useEffect, useState } from "react";
import type { LiveView } from "@/lib/bot/liveDb";
import type { T } from "@/lib/i18n";
import { useViewer } from "./PrefsProvider";
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
      fetch("/api/bot/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: View) => { if (alive) { setV(d); setStale(false); } })
        .catch(() => alive && setStale(true));
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

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

  return (
    <div className="space-y-4">
      {real && (
        <div role="alert" className="card border border-red-500/70 text-red-300">
          <strong>{t("ЖИНХЭНЭ ДАНС холбогдсон байна.", "A REAL ACCOUNT is connected.")}</strong> {t("Бот энэ дансан дээр жинхэнэ мөнгөөр арилжаа хийнэ", "The bot will trade real money on this account")}{c.allowReal ? "" : t(" — гэхдээ “Жинхэнэ данс” сонголт унтраалттай тул Start дарсан ч ажиллахгүй", " — but the “Real account” option is off, so it will not run even if you press Start")}.
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 text-lg font-semibold ${running ? "text-emerald-400" : "text-zinc-300"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${running ? "bg-emerald-400" : "bg-zinc-500"}`} />
            {running ? t("Бот ажиллаж байна", "Bot is running") : t("Бот зогссон", "Bot is stopped")}
          </span>
          <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{savedTool}</span>
          {!running && v.stopReason && <span className="text-sm text-zinc-400">({STOP_REASON[v.stopReason] ?? v.stopReason})</span>}
          <span className={`ml-auto text-xs ${v.online ? "text-emerald-400" : "text-amber-400"}`}>
            MT5: {v.online ? t("холбогдсон", "connected") : v.lastSeenAt ? t("холболт тасарсан", "connection lost") : t("холбогдоогүй", "not connected")}{stale ? t(" · самбар шинэчлэгдэхгүй байна", " · the panel is not updating") : ""}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {([
            [t("Данс", "Account"), v.accountMode ? `${v.accountMode === "REAL" ? t("Жинхэнэ", "Real") : "Demo"} ${v.accountLogin ?? ""}` : "—", real ? "text-red-300" : undefined],
            ["Balance", money(v.balance)],
            ["Equity", money(v.equity)],
            [t("Сүүлийн 24ц", "Last 24h"), money(v.pnl24h), tone(v.pnl24h)],
          ] as [string, string, string?][]).map(([k, val, cls]) => (
            <div key={k} className="min-w-0"><div className="text-xs text-zinc-400">{k}</div><div className={`truncate font-mono font-semibold sm:text-lg ${cls ?? ""}`}>{val}</div></div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={startBotAction} className="max-sm:flex-1"><button className="btn w-full px-6" disabled={running || !v.hasToken}>Start bot</button></form>
          <form action={stopBotAction} className="max-sm:flex-1"><button className="btn-ghost w-full px-6" disabled={!running}>Stop</button></form>
          <form action={closeAllAction} className="max-sm:w-full"><button className="btn-ghost w-full text-red-300" disabled={v.positions.length === 0}>{t("Бүгдийг хаах", "Close all")}</button></form>
          {v.closeAllPending && <span className="self-center text-xs text-amber-400">{t("Арилжаануудыг хааж байна…", "Closing trades…")}</span>}
        </div>
        {!v.online && <p className="mt-3 text-xs text-amber-400">{t("MT5 робот холбогдоогүй үед Start дарсан ч арилжаа хийгдэхгүй. Робот холбогдмогц тушаалыг авна.", "While the MT5 robot is not connected, pressing Start places no trades. The robot picks up the command as soon as it connects.")}</p>}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="card-title">{t("Одоо", "Now")}</h2>
          <div className={`text-3xl font-semibold tracking-tight ${v.signal === "BUY" ? "text-emerald-400" : v.signal === "SELL" ? "text-red-400" : "text-zinc-300"}`}>
            {v.signal === "BUY" ? "BUY" : v.signal === "SELL" ? "SELL" : v.signal === "NONE" ? t("Хүлээж байна", "Waiting") : "—"}
          </div>
          <p className="mt-1 text-sm text-zinc-300">{v.reason || t("Роботоос мэдээлэл ирээгүй", "No data from the robot yet")}</p>
          <p className="mt-2 font-mono text-xs text-zinc-500">{v.symbol ?? "—"}, bid {v.bid ?? "—"}, ask {v.ask ?? "—"}</p>
          {running && <p className={`mt-2 font-mono ${tone(v.runPnl)}`}>{t("Энэ удаагийн үр дүн:", "This run's result:")} {money(v.runPnl)}</p>}
          {running && c.mode === "BASKET" && (
            <p className="mt-1 text-sm text-zinc-400">
              {v.positions.length > 0 ? t(`Багц нээлттэй. ${money(c.basket.profit)} ашигт хүрвэл эсвэл ${money(-c.basket.loss)} алдагдалд хүрвэл бүгдийг зэрэг хаана.`, `Basket open. All trades close together at ${money(c.basket.profit)} profit or ${money(-c.basket.loss)} loss.`) : t("Дохио хүлээж байна. Гармагц багцыг бүхэлд нь нээнэ.", "Waiting for a signal. The whole basket opens as soon as one appears.")}
            </p>
          )}
          {running && c.mode === "ASIAN" && (
            <p className="mt-1 text-sm text-zinc-400">{v.positions.length > 0 ? t(`Арилжаа нээлттэй. Stop, target эсвэл ${ub("04:00")} (${zone}) цагт хаагдана.`, `Trade open. It closes at the stop, the target or ${ub("04:00")} (${zone}).`) : t(`Дүрэм ажиллаж байна: өдөр бүр ${ub("15:00")}–${ub("00:00")} (${zone}) цагт breakout хүлээнэ. Stop дартал зогсохгүй.`, `The rule is running: every day it waits for a breakout between ${ub("15:00")} and ${ub("00:00")} (${zone}). It does not stop until you press Stop.`)}</p>
          )}
          {running && c.mode === "SCALPER" && (
            <p className="mt-1 text-sm text-zinc-400">
              {v.plannedSeconds ? t(`Ботын тооцсон хугацаа: ${Math.round(v.plannedSeconds)} сек · өнгөрсөн ${Math.round(v.elapsedSeconds ?? 0)} сек`, `Time planned by the bot: ${Math.round(v.plannedSeconds)} s · elapsed ${Math.round(v.elapsedSeconds ?? 0)} s`) : t("Эхний арилжаагаа хүлээж байна — хугацааг орсны дараа тооцно", "Waiting for the first trade — the time is worked out after entry")}
            </p>
          )}
        </div>

        <form action={cfgAction} className="card space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">{t("Хэрэгсэл ба тохиргоо", "Tool and settings")}</h2>
          <input type="hidden" name="mode" value={tool} />
          <div role="radiogroup" aria-label={t("Ботын хэрэгсэл", "Bot tool")} className="grid gap-2 sm:grid-cols-3">
            {TOOLS.map(([id, name, about]) => (
              <button key={id} type="button" role="radio" aria-checked={tool === id} disabled={running} onClick={() => setTool(id)}
                className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tool === id ? "border-amber-400 bg-amber-400/10" : "border-zinc-700 hover:bg-zinc-800"}`}>
                <span className={`block font-semibold ${tool === id ? "text-amber-300" : "text-zinc-100"}`}>{name}</span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{about}</span>
              </button>
            ))}
          </div>
          {oldRobot && (
            <p role="alert" className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs leading-relaxed text-amber-200">
              {t("MT5 дээрх роботын файл хуучин тул энэ хэрэгсэл ажиллахгүй.", "The robot file on MT5 is old, so this tool will not work.")} <a className="underline" href="/api/bot/download?file=ex5">{t("Шинэ XauBot.ex5", "Download the new XauBot.ex5")}</a>{t("-ийг татаж Experts хавтсанд хуучныг нь дарж хуулаад MT5-аа дахин нээнэ үү.", ", copy it over the old one in the Experts folder and reopen MT5.")}
            </p>
          )}
          <div className="grid grid-cols-2 items-end gap-3" key={tool}>
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
                <input className="input" id={name} name={name} type="number" inputMode="decimal" step={step} min="0" defaultValue={val} disabled={running} />
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="allowReal" defaultChecked={c.allowReal} disabled={running} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" />
            <span>{t("Жинхэнэ данс дээр арилжаа хийхийг зөвшөөрөх", "Allow trading on a real account")} <span className="block text-xs text-zinc-500">{t("Унтраалттай үед бот зөвхөн demo данс дээр ажиллана. MT5 роботын тохиргоонд ч мөн адил сонголтыг асаах ёстой.", "When off, the bot runs only on a demo account. The same option must also be switched on in the MT5 robot's settings.")}</span></span>
          </label>
          {asian ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              {t(`Өдөрт хамгийн ихдээ нэг арилжаа, ${c.rule.lots.toFixed(2)} лотоор: алт $1 хөдлөхөд ±${money(exposure)}. Хүрээ ${ub("08:00")}–${ub("15:00")} (${zone}); ${ub("15:00")}–${ub("00:00")} цагт өдрийн трендийн чиглэлд хүрээнээс гарч хаагдсан эхний 15 минутын лаагаар орно. Stop хүрээний дунд, target 2 дахин хол, ${ub("04:00")}-д хаана.`,
                `At most one trade a day, at ${c.rule.lots.toFixed(2)} lots: ±${money(exposure)} for every $1 gold moves. The range is ${ub("08:00")}–${ub("15:00")} (${zone}); between ${ub("15:00")} and ${ub("00:00")} it enters on the first 15-minute candle that closes outside the range in the direction of the daily trend. The stop is the middle of the range, the target is twice as far, and it closes at ${ub("04:00")}.`)}
              {" "}{t("MT5-ийн Strategy Tester дээр хоёр жилд шалгасан: 2024.11–2025.11-д Profit Factor 1.59 (146 арилжаа, уналт 5.6%), 2025.11–2026.11-д 1.43 (120 арилжаа, уналт 16–22%). 0.01 лотод нэг арилжааны дундаж алдагдал $12–26 байсан. Өнгөрсөн үр дүн ирээдүйг батлахгүй; эхлээд demo дээр ажиллуул. MT5 ба компьютер асаалттай үед л ажиллана.",
                "Tested over two years in the MT5 Strategy Tester: Profit Factor 1.59 in 2024.11–2025.11 (146 trades, drawdown 5.6%) and 1.43 in 2025.11–2026.11 (120 trades, drawdown 16–22%). At 0.01 lots the average losing trade was $12–26. Past results do not guarantee the future; run it on a demo account first. It works only while MT5 and the computer are on.")}
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

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="table-card">
          <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400 sm:px-5 sm:pt-5">{t("Нээлттэй арилжаа (", "Open trades (")}{v.positions.length})</h2>
          {v.positions.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500 sm:px-5">{t("Алга", "None")}</p> : (
            <table className="w-full">
              <thead><tr>{["", t("Лот", "Lots"), t("Орсон", "Entry"), "SL", "TP", "P&L"].map((h) => <th key={h} className={`th ${h === "SL" || h === "TP" ? "hidden sm:table-cell" : ""} ${h === "P&L" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>{v.positions.map((p) => (
                <tr key={p.ticket} className="border-t border-zinc-800">
                  <td className={`td ${p.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{p.side}</td>
                  <td className="td font-mono">{p.lots}</td><td className="td font-mono">{p.openPrice}</td>
                  <td className="td hidden font-mono sm:table-cell">{p.sl || "—"}</td><td className="td hidden font-mono sm:table-cell">{p.tp || "—"}</td>
                  <td className={`td text-right font-mono ${tone(p.profit)}`}>{money(p.profit)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="table-card">
          <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400 sm:px-5 sm:pt-5">{t("Арилжааны түүх", "Trade history")} <span className="text-zinc-500">{t("(сүүлийн 50, нийт", "(last 50, total")} {v.dealCount})</span></h2>
          {v.deals.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500 sm:px-5">{t("Хаагдсан арилжаа алга", "No closed trades")}</p> : (
            <table className="w-full">
              <thead><tr>{([[`${t("Хаагдсан", "Closed")} (${zone})`, ""], ["", ""], [t("Лот", "Lots"), ""], [t("Орсон", "Entry"), "hidden sm:table-cell"], [t("Гарсан", "Exit"), "hidden sm:table-cell"], ["P&L", "text-right"]] as const).map(([h, cls]) => <th key={h} className={`th ${cls}`}>{h}</th>)}</tr></thead>
              <tbody>{v.deals.map((d) => (
                <tr key={d.ticket} className="border-t border-zinc-800">
                  <td className="td whitespace-nowrap font-mono">{who.dateTime(new Date(d.closeTime)).slice(5)}</td>
                  <td className={`td ${d.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{d.side}</td>
                  <td className="td font-mono">{d.lots}</td><td className="td hidden font-mono sm:table-cell">{d.openPrice}</td><td className="td hidden font-mono sm:table-cell">{d.closePrice}</td>
                  <td className={`td text-right font-mono ${tone(d.profit)}`}>{money(d.profit)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
      </div>

      <form action={tokAction} className="card space-y-2">
        <h2 className="text-sm font-medium text-zinc-400">{t("MT5 роботыг холбох", "Connect the MT5 robot")}</h2>
        <p className="text-sm text-zinc-300">{t("Роботын тохиргоонд энэ хаягийг оруулна:", "Enter this address in the robot's settings:")}</p>
        <code className="block rounded-lg bg-zinc-950 px-3 py-2 text-sm break-all text-zinc-200">{syncUrl}</code>
        {tokState.token ? (
          <p className="text-sm">{t("Шинэ токен (дахин харагдахгүй, одоо хуулж ав):", "New token (shown only once, copy it now):")} <code className="mt-1 block rounded-lg bg-zinc-950 px-3 py-2 break-all text-amber-300 select-all">{tokState.token}</code></p>
        ) : (
          <p className="text-sm text-zinc-400">{v.hasToken ? t("Токен үүссэн. Шинийг үүсгэвэл хуучин нь хүчингүй болж, роботод шинийг оруулах хэрэгтэй.", "A token exists. Creating a new one cancels the old one, and the new one must be entered in the robot.") : t("Токен үүсээгүй. Эхлээд токен үүсгэнэ.", "No token yet. Create one first.")}</p>
        )}
        <button className="btn-ghost" disabled={tokPending || running}>{v.hasToken ? t("Шинэ токен үүсгэх", "Create a new token") : t("Токен үүсгэх", "Create token")}</button>
      </form>
    </div>
  );
}
