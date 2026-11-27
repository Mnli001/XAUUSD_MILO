import Link from "next/link";
import type { Bucket, JournalStats, JRow } from "@/lib/journalStats";
import { weekdayName } from "@/lib/time";
import type { Viewer } from "@/lib/viewer";

export type JournalFilter = { src: "all" | "manual" | "robot"; days: "30" | "90" | "all"; login: string };

const money = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`);
const tone = (n: number) => (n > 0 ? "text-emerald-300" : n < 0 ? "text-rose-300" : "text-zinc-300");

function href(f: JournalFilter, change: Partial<JournalFilter>): string {
  const n = { ...f, ...change };
  const q = new URLSearchParams();
  if (n.login) q.set("login", n.login);
  if (n.src !== "all") q.set("src", n.src);
  q.set("days", n.days);
  return `/journal?${q.toString()}`;
}

function Chips({ items, on, label }: { items: { label: string; href: string; key: string }[]; on: string; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === on ? "page" : undefined}
          className={`chip ${i.key === on ? "border-amber-300/60 text-amber-200" : "text-zinc-400 hover:text-zinc-200"}`}>{i.label}</Link>
      ))}
    </nav>
  );
}

function Stat({ label, value, cls = "text-zinc-50" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="glass-inset px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

/** The running total after each trade: the shape of the account, closed trades only. */
function Curve({ rows, v }: { rows: JRow[]; v: Viewer }) {
  const { t } = v;
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
  const pts = sorted.reduce((acc, r) => [...acc, acc[acc.length - 1] + r.profit], [0]);
  const min = Math.min(...pts), max = Math.max(...pts), w = 600, h = 140;
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (p: number) => (max === min ? h / 2 : h - 4 - ((p - min) / (max - min)) * (h - 8));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <section className="card" aria-label={t("Нийт дүнгийн муруй", "Running total")}>
      <h2 className="card-title">{t("Нийт дүнгийн муруй", "Running total")}</h2>
      <svg role="img" aria-label={t(`Хаасан ${sorted.length} trade-ийн нийт дүн: ${money(last)}`, `Running total over ${sorted.length} closed trades: ${money(last)}`)} viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" preserveAspectRatio="none">
        {min < 0 && max > 0 && <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-zinc-700" />}
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className={last >= 0 ? "text-emerald-300" : "text-rose-300"} />
      </svg>
      <p className="mt-2 text-xs text-zinc-500 tabular-nums">{v.date(sorted[0].closeTime)} – {v.date(sorted[sorted.length - 1].closeTime)}</p>
    </section>
  );
}

/** A group's rows with a bar of its net: who made and who lost the money. */
function Breakdown({ title, rows, name, v }: { title: string; rows: Bucket[]; name: (k: string) => string; v: Viewer }) {
  const { t } = v;
  const shown = rows.filter((r) => r.trades > 0);
  if (!shown.length) return null;
  const top = Math.max(...shown.map((r) => Math.abs(r.net)), 1);
  return (
    <section className="card" aria-label={title}>
      <h2 className="card-title">{title}</h2>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="text-left text-xs text-zinc-500">
          <th className="pb-1.5 pr-2 font-medium" />
          <th className="pb-1.5 pr-2 text-right font-medium">{t("Тоо", "Trades")}</th>
          <th className="pb-1.5 pr-2 text-right font-medium">Win</th>
          <th className="pb-1.5 text-right font-medium">{t("Дүн", "Net")}</th>
        </tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key} className="border-t border-white/5">
              <td className="py-1.5 pr-2 text-zinc-300">
                {name(r.key)}
                <span aria-hidden className="mt-1 block h-1 rounded-full bg-white/5"><span className={`block h-1 rounded-full ${r.net >= 0 ? "bg-emerald-400/70" : "bg-rose-400/70"}`} style={{ width: `${Math.max(3, (Math.abs(r.net) / top) * 100)}%` }} /></span>
              </td>
              <td className="py-1.5 pr-2 text-right text-zinc-400 tabular-nums">{r.trades}</td>
              <td className="py-1.5 pr-2 text-right text-zinc-400 tabular-nums">{r.winPct}%</td>
              <td className={`py-1.5 text-right tabular-nums ${tone(r.net)}`}>{money(r.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function JournalPanel({ rows, s, v, filter, logins }: { rows: JRow[]; s: JournalStats; v: Viewer; filter: JournalFilter; logins: string[] }) {
  const { t } = v;
  const sess = (k: string) => ({ ASIA: t("Ази", "Asia"), LONDON: t("Лондон", "London"), NY: t("Нью-Йорк", "New York"), OFF: t("Завсар", "Off-hours") })[k] ?? k;
  const tot = s.totals;
  const filters = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Chips label={t("Эх үүсвэр", "Source")} on={filter.src} items={[
        { key: "all", label: t("Бүгд", "All"), href: href(filter, { src: "all" }) },
        { key: "manual", label: t("Гараар", "By hand"), href: href(filter, { src: "manual" }) },
        { key: "robot", label: t("Robot", "Robots"), href: href(filter, { src: "robot" }) },
      ]} />
      <Chips label={t("Хугацаа", "Period")} on={filter.days} items={[
        { key: "30", label: t("30 өдөр", "30 days"), href: href(filter, { days: "30" }) },
        { key: "90", label: t("90 өдөр", "90 days"), href: href(filter, { days: "90" }) },
        { key: "all", label: t("Бүгд", "All time"), href: href(filter, { days: "all" }) },
      ]} />
      {logins.length > 1 && (
        <Chips label={t("Данс", "Account")} on={filter.login} items={[
          { key: "", label: t("Бүх данс", "All accounts"), href: href(filter, { login: "" }) },
          ...logins.map((l) => ({ key: l, label: `…${l.slice(-4)}`, href: href(filter, { login: l }) })),
        ]} />
      )}
    </div>
  );

  if (!rows.length) {
    return (
      <div className="space-y-4">
        {filters}
        <section className="card">
          <h2 className="card-title">{t("Trade алга", "No trades yet")}</h2>
          <p className="max-w-prose text-sm leading-relaxed text-zinc-300">
            {t("MT5 дээр ажиллаж буй XauBot robot (v3.90 ба түүнээс шинэ) таны дансны хаасан бүх trade-ийг — гараар хийсэн ч, өөр robot-ийнх ч — сүүлийн 90 өдрөөс эхлэн энд автоматаар илгээнэ. Robot-оо шинэчлээд холбоно уу.",
              "The XauBot robot on MT5 (v3.90 or newer) sends every closed trade on your account here on its own — by hand or by any other robot — starting 90 days back. Update the robot and connect it.")}
          </p>
          <Link href="/bot" className="btn mt-4">{t("Bot руу очих", "Go to the bot")}</Link>
        </section>
      </div>
    );
  }

  const recent = [...rows].sort((a, b) => b.closeTime.getTime() - a.closeTime.getTime()).slice(0, 50);
  const b = s.behaviour;
  return (
    <div className="space-y-4 sm:space-y-5">
      {filters}
      <section className="card" aria-label={t("Нийт дүн", "Totals")}>
        <h2 className="card-title">{t("Нийт дүн", "Totals")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t("Trade", "Trades")} value={String(tot.trades)} />
          <Stat label="Win rate" value={`${tot.winPct}%`} />
          <Stat label={t("Цэвэр дүн", "Net")} value={money(tot.net)} cls={tone(tot.net)} />
          <Stat label="Profit factor" value={tot.profitFactor === null ? "—" : tot.profitFactor.toFixed(2)} />
          <Stat label={t("Нэг trade-ийн дундаж", "Per trade")} value={money(tot.expectancy)} cls={tone(tot.expectancy)} />
          <Stat label={t("Дараалсан loss", "Loss streak")} value={String(tot.maxLossStreak)} />
        </div>
        <p className="mt-3 text-xs text-zinc-500 tabular-nums">
          {t("Дундаж ашиг", "Avg win")} {money(tot.avgWin)} · {t("дундаж алдагдал", "avg loss")} {money(tot.avgLoss)} · {t("хамгийн сайн", "best")} {money(tot.best)} · {t("хамгийн муу", "worst")} {money(tot.worst)}
        </p>
      </section>

      {s.insights.length > 0 && (
        <section className="card" aria-label={t("Анхаарах зүйлс", "What stands out")}>
          <h2 className="card-title">{t("Анхаарах зүйлс", "What stands out")}</h2>
          <ul className="space-y-2.5">
            {s.insights.map((i) => (
              <li key={i.kind} className="flex gap-3 text-sm leading-relaxed text-zinc-200">
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.tone === "good" ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Curve rows={rows} v={v} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Breakdown title={t("Session-ээр", "By session")} rows={s.bySession} name={sess} v={v} />
        <Breakdown title={t("Гарагаар", "By weekday")} rows={s.byWeekday} name={(k) => weekdayName(Number(k), t)} v={v} />
        <Breakdown title={t(`Нээсэн цагаар (${v.zone})`, `By opening hour (${v.zone})`)} rows={s.byHour} name={(k) => `${k}:00`} v={v} />
        <div className="space-y-4 sm:space-y-5">
          <Breakdown title={t("Чиглэлээр", "By side")} rows={s.bySide} name={(k) => k} v={v} />
          <Breakdown title={t("Хэрэгслээр", "By instrument")} rows={s.bySymbol} name={(k) => k} v={v} />
        </div>
      </div>

      <section className="card" aria-label={t("Зан төлөв", "Habits")}>
        <h2 className="card-title">{t("Зан төлөв", "Habits")}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="glass-inset px-4 py-3"><dt className="text-xs text-zinc-500">{t("Loss-ын дараа 30 минутад нээсэн", "Opened within 30 min of a loss")}</dt>
            <dd className="mt-1 text-zinc-200 tabular-nums">{b.afterLoss.trades} trade · {b.afterLoss.trades ? `${b.afterLoss.winPct}% · ` : ""}<span className={tone(b.afterLoss.net)}>{money(b.afterLoss.net)}</span></dd></div>
          <div className="glass-inset px-4 py-3"><dt className="text-xs text-zinc-500">{t("Ердийнхөөс том lot", "Larger than usual lot")}</dt>
            <dd className="mt-1 text-zinc-200 tabular-nums">{b.bigLots.trades} trade · <span className={tone(b.bigLots.net)}>{money(b.bigLots.net)}</span></dd></div>
          <div className="glass-inset px-4 py-3"><dt className="text-xs text-zinc-500">{t("Барьсан дундаж хугацаа", "Average time held")}</dt>
            <dd className="mt-1 text-zinc-200 tabular-nums">{t("Ашигтай", "Winners")} {b.holdWin ?? "—"} {t("мин", "min")} · {t("алдагдалтай", "losers")} {b.holdLoss ?? "—"} {t("мин", "min")}</dd></div>
        </dl>
      </section>

      <div className="table-card">
        <table className="w-full border-collapse" aria-label={t("Сүүлийн trade-үүд", "Recent trades")}>
          <thead><tr>
            <th className="th">{t("Хаасан", "Closed")}</th>
            <th className="th">{t("Хэрэгсэл", "Instrument")}</th>
            <th className="th">{t("Тал", "Side")}</th>
            <th className="th text-right">Lot</th>
            <th className="th text-right">{t("Нээсэн → хаасан", "Open → close")}</th>
            <th className="th">{t("Хэн", "By")}</th>
            <th className="th text-right">{t("Дүн", "Net")}</th>
          </tr></thead>
          <tbody>
            {recent.map((r, i) => (
              <tr key={`${r.closeTime.getTime()}-${i}`} className="border-t border-white/5">
                <td className="td whitespace-nowrap text-zinc-400 tabular-nums">{v.dateTime(r.closeTime)}</td>
                <td className="td text-zinc-200">{r.symbol}</td>
                <td className={`td ${r.side === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>{r.side}</td>
                <td className="td text-right tabular-nums text-zinc-300">{r.lots}</td>
                <td className="td text-right whitespace-nowrap tabular-nums text-zinc-400">{r.openPrice} → {r.closePrice}</td>
                <td className="td text-zinc-400">{r.magic === "0" ? t("Гараар", "Hand") : "Robot"}</td>
                <td className={`td text-right tabular-nums ${tone(r.profit)}`}>{money(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
