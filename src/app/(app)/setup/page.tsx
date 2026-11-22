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

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup — XAU Analytics" };

const statusOf = (t: T): Record<Setup["status"], [string, string]> => ({
  ACTIVE: [t("Идэвхтэй", "Active"), "border-emerald-400/60 bg-emerald-400/10 text-emerald-400"],
  WATCH: [t("Ажиглах", "Watch"), "border-amber-400/60 bg-amber-400/10 text-amber-300"],
  FORMING: [t("Бүрдэж байна", "Forming"), "border-zinc-600 text-zinc-300"],
  OFF: [t("Одоо алга", "Not now"), "border-zinc-700 text-zinc-500"],
});
const px = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Record({ title, h, t }: { title: string; h: SetupHistory; t: T }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs text-zinc-400"><span>{title}</span><span className="font-mono">{h.n} {t("арилжаа", "trades")}</span></div>
      {h.winPct === null ? (
        <p className="mt-1 text-sm text-zinc-500">{t("Дата хангалтгүй (30-аас цөөн арилжаа)", "Not enough data (fewer than 30 trades)")}</p>
      ) : (
        <>
          <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-red-500/60" role="img" aria-label={t(`${h.winPct}% ашигтай хаагдсан`, `${h.winPct}% closed in profit`)}><div className="bg-emerald-500" style={{ width: `${h.winPct}%` }} /></div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-sm">
            <span className="text-zinc-100">{h.winPct}{t("% ашигтай", "% profitable")}</span>
            <span className={h.avgR! > 0 ? "text-emerald-400" : h.avgR! < 0 ? "text-red-400" : "text-zinc-300"}>{t("дундаж", "average")} {h.avgR! > 0 ? "+" : ""}{h.avgR!.toFixed(2)}R</span>
            <span className="text-zinc-400">PF {h.profitFactor === null ? "—" : h.profitFactor.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default async function SetupPage() {
  const v = await getViewer();
  const { t } = v;
  const STATUS = statusOf(t);
  const now = new Date();
  const user = await requireUser();
  const [view, next, signals] = await Promise.all([getSetups(now, v), getNextHighEvent(now), listSignals(15)]);
  const candles = view.candles.map((c) => ({ ...c, time: c.time.toISOString() }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Setup</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">{t("Хоёр тогтсон дүрмийг одоогийн зах дээр уншиж, орох боломж бүрдэж байгаа эсэх, хаанаас орж, хаана stop, target тавихыг зургаар харуулна. Дүрэм бүрийн хажууд түүхэнд яг энэ дүрэм ямар үр дүн өгснийг тавьсан.", "Two fixed rules are read against the current market: whether an entry is forming, where to enter, and where the stop and target go, drawn on a chart. Next to each rule is how exactly that rule has done in the past.")}</p>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          {view.lastCandleAt ? t(`Сүүлийн лаа ${v.dateTime(view.lastCandleAt)} (${v.zone}), үнэ хэдэн минут хоцорно`, `Last candle ${v.dateTime(view.lastCandleAt)} (${v.zone}); the price lags by a few minutes`) : t("Лааны дата ачаалж байна", "Loading candle data")}
          {next && <span className="ml-3 text-amber-400">{t("Дараагийн чухал мэдээ", "Next important release")} {v.time(next.time)}: {eventTitle(next, t)}</span>}
        </p>
      </div>

      {view.setups.map((s) => {
        const [label, tone] = STATUS[s.status];
        const rr = s.entry !== null && s.stop !== null && s.target !== null && s.entry !== s.stop ? Math.abs(s.target - s.entry) / Math.abs(s.entry - s.stop) : null;
        return (
          <section key={s.id} className="card">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-zinc-50">{s.name}</h2>
                  <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
                </div>
                <p className={`mt-3 text-xl font-semibold tracking-tight ${s.status === "OFF" ? "text-zinc-300" : s.side === "BUY" ? "text-emerald-400" : s.side === "SELL" ? "text-red-400" : "text-zinc-100"}`}>{s.headline}</p>
                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-zinc-300">{s.detail}</p>

                {s.entry !== null && (
                  <dl className="mt-4 grid grid-cols-4 gap-2 text-sm">
                    {([[t("Орох", "Entry"), px(s.entry), "text-amber-300"], ["Stop", px(s.stop), "text-red-400"], ["Target", px(s.target), "text-emerald-400"], ["R:R", rr === null ? "—" : `1 : ${rr.toFixed(1)}`, "text-zinc-100"]] as const).map(([k, val, c]) => (
                      <div key={k} className="rounded-lg border border-zinc-800 px-2 py-1.5"><dt className="text-xs text-zinc-500">{k}</dt><dd className={`truncate font-mono font-semibold ${c}`}>{val}</dd></div>
                    ))}
                  </dl>
                )}

                {s.checks.length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {s.checks.map((c) => (
                      <li key={c.label} className={`flex items-start gap-2 ${c.ok ? "text-zinc-200" : "text-zinc-500"}`}>
                        <span aria-hidden className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] ${c.ok ? "border-emerald-400 bg-emerald-400/15 text-emerald-400" : "border-zinc-600"}`}>{c.ok ? "✓" : ""}</span>
                        <span>{c.label}<span className="sr-only">{c.ok ? t(" (биелсэн)", " (met)") : t(" (биелээгүй)", " (not met)")}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="min-w-0"><SetupChart candles={candles} side={s.side} entry={s.entry} stop={s.stop} target={s.target} band={s.band} v={v} /></div>
            </div>

            <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-zinc-800 pt-4 sm:grid-cols-2">
              <Record t={t} title={t("Түүхэн үр дүн, бүх хугацаа", "Historical record, all time")} h={s.history} />
              <Record t={t} title={t("Сүүлийн 12 сар", "Last 12 months")} h={s.recent} />
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">{t("Дүрмийг бүтнээр нь унших", "Read the full rule")}</summary>
              <p className="mt-2 max-w-prose leading-relaxed text-zinc-300">{s.rule}</p>
            </details>
          </section>
        );
      })}

      <TelegramCard configured={telegramConfigured()} linked={!!user.telegramChatId} isAdmin={user.role === "ADMIN"} />

      <section className="table-card">
        <h2 className="px-4 pt-4 text-sm font-medium text-zinc-400 sm:px-5 sm:pt-5">{t("Сүүлийн дохионууд", "Recent signals")}</h2>
        {signals.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500 sm:px-5">{t("Одоогоор дохио гараагүй. Setup идэвхжих бүрд энд бүртгэгдэнэ.", "No signals yet. Each time a setup becomes active it is recorded here.")}</p> : (
          <table className="w-full">
            <thead><tr>{([[`${t("Гарсан", "Time")} (${v.zone})`, ""], ["", ""], [t("Дүрэм", "Rule"), "hidden sm:table-cell"], [t("Орох", "Entry"), "text-right"], ["Stop", "text-right"], ["Target", "text-right"]] as const).map(([h, cls]) => <th key={h} className={`th ${cls}`}>{h}</th>)}</tr></thead>
            <tbody>
              {signals.map((g) => (
                <tr key={g.id} className="border-t border-zinc-800">
                  <td className="td font-mono whitespace-nowrap text-zinc-400">{v.dateTime(g.createdAt).slice(5)}</td>
                  <td className={`td font-semibold ${g.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{g.side}</td>
                  <td className="td hidden sm:table-cell">{view.setups.find((x) => x.id === g.setupId)?.name ?? g.name}</td>
                  <td className="td text-right font-mono">{px(g.entry)}</td>
                  <td className="td text-right font-mono text-red-400">{px(g.stop)}</td>
                  <td className="td text-right font-mono text-emerald-400">{px(g.target)}</td>
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
