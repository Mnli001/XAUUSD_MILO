import { getSetups, type Setup } from "@/lib/setup/build";
import type { SetupHistory } from "@/lib/setup/setups";
import { getNextHighEvent } from "@/lib/events";
import { SetupChart } from "@/components/SetupChart";
import { TelegramCard } from "@/components/TelegramCard";
import { requireUser } from "@/lib/auth";
import { listSignals } from "@/lib/signals";
import { telegramConfigured } from "@/lib/telegram";
import { getViewer } from "@/lib/prefs.server";
import { eventTitle } from "@/lib/data/calendarProvider";
import type { T } from "@/lib/i18n";
import { Dir } from "@/components/Timetable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup — XAU Analytics" };

/** Setup states as status pills: [word, pill, dot]. The word always carries the meaning. */
const statusOf = (t: T): Record<Setup["status"], [string, string, string]> => ({
  ACTIVE: [t("Идэвхтэй", "Active"), "bg-emerald-500/15 text-emerald-400", "bg-emerald-400"],
  WATCH: [t("Ажиглах", "Watch"), "bg-amber-400/15 text-amber-300", "bg-amber-400"],
  FORMING: [t("Бүрдэж байна", "Forming"), "bg-zinc-800 text-zinc-200", "bg-zinc-400"],
  OFF: [t("Одоо алга", "Not now"), "border border-zinc-800 text-zinc-500", "bg-zinc-600"],
});
const px = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Record({ title, h, t }: { title: string; h: SetupHistory; t: T }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-zinc-400"><span>{title}</span><span className="text-xs text-zinc-500 tabular-nums">{h.n} {t("арилжаа", "trades")}</span></div>
      {h.winPct === null ? (
        <p className="mt-1 text-sm text-zinc-500">{t("Дата хангалтгүй (30-аас цөөн арилжаа)", "Not enough data (fewer than 30 trades)")}</p>
      ) : (
        <>
          <div className="mt-2 flex h-[5px] overflow-hidden rounded-full bg-red-500/70" role="img" aria-label={t(`${h.winPct}% ашигтай хаагдсан`, `${h.winPct}% closed in profit`)}><div className="bg-emerald-500" style={{ width: `${h.winPct}%` }} /></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-sm tabular-nums">
            <span className="font-semibold text-zinc-100">{h.winPct}{t("% ашигтай", "% profitable")}</span>
            <span className={h.avgR! > 0 ? "text-emerald-400" : h.avgR! < 0 ? "text-red-400" : "text-zinc-300"}>{t("дундаж", "average")} {h.avgR! > 0 ? "+" : ""}{h.avgR!.toFixed(2)}R</span>
            <span className="text-zinc-400">PF {h.profitFactor === null ? "—" : h.profitFactor.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Entry, stop and target as stations on one price line, highest at the top, like the key-levels ladder on Today. */
function Ladder({ s, t }: { s: Setup; t: T }) {
  if (s.entry === null) return null;
  const entry = s.entry;
  type Kind = "entry" | "stop" | "target";
  const all: [string, number | null, Kind][] = [[t("Орох", "Entry"), s.entry, "entry"], ["Stop", s.stop, "stop"], ["Target", s.target, "target"]];
  const rows = all.filter((r): r is [string, number, Kind] => r[1] !== null).sort((a, b) => b[1] - a[1]);
  const rr = s.stop !== null && s.target !== null && entry !== s.stop ? Math.abs(s.target - entry) / Math.abs(entry - s.stop) : null;
  const station = { entry: "border-zinc-50 bg-amber-400", stop: "border-red-400 bg-zinc-900", target: "border-emerald-400 bg-zinc-900" };
  return (
    <div className="mt-4 max-w-sm">
      <div className="relative">
        <span aria-hidden className="absolute top-3.5 bottom-3.5 left-[5px] w-[3px] rounded-full bg-zinc-800" />
        <dl>
          {rows.map(([k, val, kind]) => (
            <div key={kind} className="relative flex items-center gap-3 py-1.5 text-sm">
              <span aria-hidden className={`relative z-10 h-[13px] w-[13px] shrink-0 rounded-full border-[3px] ${station[kind]}`} />
              <dt className={kind === "entry" ? "font-semibold text-amber-300" : "text-zinc-400"}>{k}</dt>
              <dd className="ml-auto flex items-baseline gap-3">
                <span className="font-semibold text-zinc-100 tabular-nums">{px(val)}</span>
                <span className={`w-16 text-right text-xs tabular-nums ${kind === "stop" ? "text-red-400" : kind === "target" ? "text-emerald-400" : "text-zinc-500"}`}>
                  {kind === "entry" ? "" : `${kind === "target" ? "+" : "−"}$${Math.abs(val - entry).toFixed(2)}`}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <dl className="mt-1 flex items-baseline justify-between gap-3 border-t border-zinc-800 pt-2 text-sm">
        <dt className="text-zinc-400">R:R</dt>
        <dd className="font-semibold text-zinc-100 tabular-nums">{rr === null ? "—" : `1 : ${rr.toFixed(1)}`}</dd>
      </dl>
    </div>
  );
}

const chevron = <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export default async function SetupPage() {
  const v = await getViewer();
  const { t } = v;
  const STATUS = statusOf(t);
  const now = new Date();
  const user = await requireUser();
  const [view, next, signals] = await Promise.all([getSetups(now, v), getNextHighEvent(now), listSignals(15)]);
  const candles = view.candles.map((c) => ({ ...c, time: c.time.toISOString() }));
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">Setup</h1>
        <p className="page-lede">{t("Хоёр тогтсон дүрмийг одоогийн зах дээр уншиж, орох боломж бүрдэж байгаа эсэх, хаанаас орж, хаана stop, target тавихыг зургаар харуулна. Дүрэм бүрийн хажууд түүхэнд яг энэ дүрэм ямар үр дүн өгснийг тавьсан.", "Two fixed rules are read against the current market: whether an entry is forming, where to enter, and where the stop and target go, drawn on a chart. Next to each rule is how exactly that rule has done in the past.")}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500 tabular-nums">
          <span>{view.lastCandleAt ? t(`Сүүлийн лаа ${v.dateTime(view.lastCandleAt)} (${v.zone}), үнэ хэдэн минут хоцорно`, `Last candle ${v.dateTime(view.lastCandleAt)} (${v.zone}); the price lags by a few minutes`) : t("Лааны дата ачаалж байна", "Loading candle data")}</span>
          {next && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 font-medium text-amber-300"><span aria-hidden className="h-1.5 w-1.5 shrink-0 rotate-45 rounded-[1px] bg-amber-400" />{t("Дараагийн чухал мэдээ", "Next important release")} {v.time(next.time)}: {eventTitle(next, t)}</span>}
        </p>
      </div>

      {view.setups.map((s) => {
        const [label, tone, dot] = STATUS[s.status];
        const live = s.status !== "OFF" && s.side !== null;
        return (
          <section key={s.id} className="card">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <h2 className="text-[15px] font-semibold text-zinc-100">{s.name}</h2>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</span>
                </div>
                <p className={`mt-3 flex items-baseline gap-2 text-xl leading-snug font-bold tracking-[-0.01em] ${!live ? "text-zinc-200" : s.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                  {live && <Dir d={s.side === "BUY" ? 1 : -1} />}
                  <span>{s.headline}</span>
                </p>
                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-zinc-400">{s.detail}</p>

                <Ladder s={s} t={t} />

                {s.checks.length > 0 && (
                  <div className="relative mt-4">
                    {s.checks.length > 1 && <span aria-hidden className="absolute top-3.5 bottom-3.5 left-[5px] w-[3px] rounded-full bg-zinc-800" />}
                    <ul className="text-sm">
                      {s.checks.map((c) => (
                        <li key={c.label} className={`relative flex items-start gap-3 py-1 ${c.ok ? "text-zinc-200" : "text-zinc-500"}`}>
                          <span aria-hidden className={`relative z-10 mt-[3.5px] h-[13px] w-[13px] shrink-0 rounded-full border-[3px] ${c.ok ? "border-emerald-400 bg-emerald-400" : "border-zinc-600 bg-zinc-900"}`} />
                          <span>{c.label}<span className="sr-only">{c.ok ? t(" (биелсэн)", " (met)") : t(" (биелээгүй)", " (not met)")}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="min-w-0"><SetupChart candles={candles} side={s.side} entry={s.entry} stop={s.stop} target={s.target} band={s.band} v={v} /></div>
            </div>

            <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-zinc-800 pt-4 sm:grid-cols-2">
              <Record t={t} title={t("Түүхэн үр дүн, бүх хугацаа", "Historical record, all time")} h={s.history} />
              <Record t={t} title={t("Сүүлийн 12 сар", "Last 12 months")} h={s.recent} />
            </div>
            <details className="group mt-2 text-sm">
              <summary className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-zinc-400 hover:text-zinc-200">{t("Дүрмийг бүтнээр нь унших", "Read the full rule")}{chevron}</summary>
              <p className="mt-1 max-w-prose leading-relaxed text-zinc-300">{s.rule}</p>
            </details>
          </section>
        );
      })}

      <TelegramCard configured={telegramConfigured()} linked={!!user.telegramChatId} isAdmin={user.role === "ADMIN"} />

      <section className="table-card" aria-labelledby="signals-h">
        <h2 id="signals-h" className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{t("Сүүлийн дохионууд", "Recent signals")}</h2>
        {signals.length === 0 ? <p className="px-4 pb-4 text-sm text-zinc-500 sm:px-5 sm:pb-5">{t("Одоогоор дохио гараагүй. Setup идэвхжих бүрд энд бүртгэгдэнэ.", "No signals yet. Each time a setup becomes active it is recorded here.")}</p> : (
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-zinc-800">{([[`${t("Гарсан", "Time")} (${v.zone})`, ""], ["", ""], [t("Дүрэм", "Rule"), "hidden sm:table-cell"], [t("Орох", "Entry"), "text-right"], ["Stop", "text-right"], ["Target", "text-right"]] as const).map(([h, cls], i) => <th key={i} className={`th ${cls}`}>{h}</th>)}</tr></thead>
            <tbody>
              {signals.map((g) => (
                <tr key={g.id} className="border-t border-zinc-800/70 first:border-t-0">
                  <td className="td whitespace-nowrap text-zinc-400 tabular-nums">{v.dateTime(g.createdAt).slice(5)}</td>
                  <td className={`td font-semibold whitespace-nowrap ${g.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}><Dir d={g.side === "BUY" ? 1 : -1} /> {g.side}</td>
                  <td className="td hidden text-zinc-300 sm:table-cell">{view.setups.find((x) => x.id === g.setupId)?.name ?? g.name}</td>
                  <td className="td text-right font-medium text-zinc-100 tabular-nums">{px(g.entry)}</td>
                  <td className="td text-right text-red-400 tabular-nums">{px(g.stop)}</td>
                  <td className="td text-right text-emerald-400 tabular-nums">{px(g.target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">
        {t(`Түүхэн үр дүн нь хадгалагдсан лаанууд дээр (${view.historyFrom ? `${v.date(view.historyFrom)}-оос` : "дата ирмэгц"}) дүрмийг дахин тоглуулж гаргасан тоо: spread $0.30, лаан доторх stop-ыг target-аас түрүүлж тооцсон. R нь эрсдэлийн нэгж (stop хүртэлх зай). Энэ хоёр дүрмийн аль нь ч урьдчилан тавьсан шалгуурыг (шалгах хэсэгт дундаж R ≥ 0.1, profit factor ≥ 1.2) бүрэн даваагүй. Ирээдүйн үр дүнг батлахгүй, санхүүгийн зөвлөгөө биш.`,
          `The historical record comes from replaying the rule over the stored candles (${view.historyFrom ? `from ${v.date(view.historyFrom)}` : "once data arrives"}): a $0.30 spread, and a stop inside a candle counted before the target. R is the unit of risk (the distance to the stop). Neither of these two rules fully cleared the criteria set in advance (average R ≥ 0.1 and profit factor ≥ 1.2 on the test period). It does not guarantee future results and is not financial advice.`)}
      </p>
    </div>
  );
}
