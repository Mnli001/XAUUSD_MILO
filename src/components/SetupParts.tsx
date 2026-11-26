import Link from "next/link";
import type { ReactNode } from "react";
import type { Setup } from "@/lib/setup/build";
import type { SetupHistory } from "@/lib/setup/setups";
import type { NowWindow } from "@/lib/setup/now";
import type { SignalRow } from "@/lib/signalHistory";
import { outcomeTotals } from "@/lib/signalOutcome";
import type { T } from "@/lib/i18n";
import type { Viewer } from "@/lib/viewer";
import { SetupChart } from "./SetupChart";
import { TermHint } from "./TermHint";
import { Masked, UnlockLink } from "./Paywall";
import { Dir } from "./Timetable";
import { Icon } from "./TodayIcons";
import { ruleOf } from "@/lib/setup/sessionRules";
import { rangeLabel, signalWindowLabel, stamp } from "@/lib/siteCopy";

/*
 * The pieces of the Setup page: the "now" card, a setup's tab and its panel (chart, levels, checks, record, rule),
 * the locked panel for someone without a plan, and the live signal results.
 */

type Bar = { time: string; open: number; high: number; low: number; close: number };
const px = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const rText = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}R`;
const box = "rounded-2xl border p-4 sm:p-5";
/** The legend for a setup's shaded range on its chart: that setup's own hours, not always Asia's. */
const bandText = (s: Setup, v: Viewer) => { const rule = ruleOf(s.id); return rule ? rangeLabel(rule, v) : v.t("Хүрээ", "Range"); };
const boxStyle = { borderColor: "var(--hairline)", background: "var(--glass-inset)" };

/** Setup states as pills: [word, pill classes, dot]. The word always carries the meaning. */
export const statusOf = (t: T): Record<Setup["status"], [string, string, string]> => ({
  ACTIVE: [t("Идэвхтэй", "Active"), "bg-emerald-500/15 text-emerald-400", "bg-emerald-400"],
  WATCH: [t("Ажиглах", "Watch"), "bg-amber-400/15 text-amber-300", "bg-amber-400"],
  FORMING: [t("Бүрдэж байна", "Forming"), "bg-zinc-500/15 text-zinc-200", "bg-zinc-400"],
  OFF: [t("Одоо алга", "Not now"), "border border-zinc-800 text-zinc-500", "bg-zinc-600"],
});

/** A setup's state for the pill, with a trade that already ended today shown as finished, won or lost. */
export function stateOf(s: Setup, t: T): [string, string, string] {
  if (s.result === undefined) return statusOf(t)[s.status];
  return [t("Дууссан", "Finished"), s.result > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400", s.result > 0 ? "bg-emerald-400" : "bg-red-400"];
}

function Pill({ s, t }: { s: Setup; t: T }) {
  const [word, tone, dot] = stateOf(s, t);
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tone}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot} ${s.status === "ACTIVE" ? "animate-pulse" : ""}`} />{word}
    </span>
  );
}

/** The one card on top: what the system is doing now, what it waits for, and when the next step comes. */
export function NowCard({ w, t }: { w: NowWindow; t: T }) {
  const tone = {
    WAIT: ["var(--hairline-gold)", "bg-amber-400", "text-amber-300", t("Одоо · хүлээж байна", "Now · waiting")],
    ENTER: ["rgb(111 207 163 / 0.45)", "bg-emerald-400", "text-emerald-400", t("Одоо · арилжаа идэвхтэй", "Now · trade on")],
    DONE: ["var(--hairline)", "bg-zinc-400", "text-zinc-300", t("Одоо · дууссан", "Now · done")],
    NONE: ["var(--hairline)", "bg-zinc-500", "text-zinc-400", t("Одоо · өнөөдөр арилжаа алга", "Now · no trade today")],
    CLOSED: ["var(--hairline)", "bg-zinc-500", "text-zinc-400", t("Одоо · зах хаалттай", "Now · market closed")],
  }[w.state];
  return (
    <section className="card flex flex-col gap-4 lg:flex-row lg:items-center" style={{ boxShadow: `inset 0 0 0 1px ${tone[0]}, var(--shadow-panel)` }} aria-labelledby="now-h">
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-2 text-xs font-semibold ${tone[2]}`}><span aria-hidden className={`h-2 w-2 rounded-full ${tone[1]} ${w.state === "ENTER" || w.state === "WAIT" ? "animate-pulse" : ""}`} />{tone[3]}</p>
        <h2 id="now-h" className="font-display mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[22px] leading-tight text-zinc-50 sm:text-[26px]">
          {w.title}
          {w.liveR !== null && <span className={`rounded-full px-2.5 py-0.5 font-sans text-sm font-semibold tabular-nums ${w.liveR >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{w.liveR > 0 ? "+" : ""}{w.liveR.toFixed(2)}R</span>}
        </h2>
      </div>
      {(w.waitingFor || w.next) && (
        <dl className="grid gap-2.5 sm:grid-cols-2 lg:flex lg:shrink-0">
          {w.waitingFor && <div className="glass-tile px-3.5 py-2.5 lg:max-w-xs"><dt className="text-xs text-zinc-500">{t("Яг одоо хүлээж байгаа нь", "Waiting for")}</dt><dd className="mt-0.5 text-sm font-semibold text-amber-300">{w.waitingFor}</dd></div>}
          {w.next && <div className="glass-tile px-3.5 py-2.5"><dt className="text-xs text-zinc-500">{w.next.label}</dt><dd className="mt-0.5 text-sm font-semibold text-zinc-100 tabular-nums">{w.next.in}</dd></div>}
        </dl>
      )}
    </section>
  );
}

/** A setup in the list: name, state, the one-line headline and its last 12 months. `paid` false: the state and figures are masked. */
export function SetupTab({ s, t, paid }: { s: Setup; t: T; paid: boolean }) {
  const r = s.recent;
  return (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-zinc-100">{s.name}</span>
        {paid ? <Pill s={s} t={t} /> : <Masked t={t} className="text-xs" />}
      </span>
      {paid && <span className={`mt-1.5 block text-[13px] leading-snug ${s.result !== undefined ? (s.result > 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-400"}`}>{s.headline}</span>}
      <span className="mt-2 flex flex-wrap gap-x-2.5 text-xs text-zinc-500 tabular-nums">
        <span>{t("12 сар", "12 months")}</span>
        {!paid ? <Masked t={t} /> : r.winPct === null || r.avgR === null ? <span>{t("дата хангалтгүй", "not enough data")}</span> : (
          <>
            <span className="text-zinc-300">{r.winPct}%</span>
            <span className={r.avgR >= 0 ? "text-emerald-400" : "text-red-400"}>{rText(r.avgR)}</span>
            <span>{t(`${r.n} арилжаа`, `${r.n} trades`)}</span>
          </>
        )}
      </span>
    </>
  );
}

/** Entry, stop and target, highest first, with the distance from the entry and the reward-to-risk. */
export function Ladder({ s, t }: { s: Setup; t: T }) {
  if (s.entry === null) return null;
  const entry = s.entry;
  type Kind = "entry" | "stop" | "target";
  const all: [string, number | null, Kind][] = [[t("Орох", "Entry"), s.entry, "entry"], ["Stop", s.stop, "stop"], ["Target", s.target, "target"]];
  const rows = all.filter((r): r is [string, number, Kind] => r[1] !== null).sort((a, b) => b[1] - a[1]);
  const rr = s.stop !== null && s.target !== null && entry !== s.stop ? Math.abs(s.target - entry) / Math.abs(entry - s.stop) : null;
  const dot = { entry: "bg-amber-300", stop: "bg-red-400", target: "bg-emerald-400" };
  return (
    <div className={box} style={boxStyle}>
      <h3 className="text-sm font-semibold text-zinc-300">{t("Түвшин", "Levels")}</h3>
      <dl className="mt-2">
        {rows.map(([k, val, kind]) => (
          <div key={kind} className="flex items-center gap-3 py-2 text-sm">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[kind]}`} />
            <dt className={kind === "entry" ? "font-semibold text-amber-300" : "text-zinc-300"}>{k}</dt>
            <dd className="ml-auto flex items-baseline gap-3">
              <span className="font-semibold text-zinc-100 tabular-nums">{px(val)}</span>
              <span className={`w-16 text-right text-xs tabular-nums ${kind === "stop" ? "text-red-400" : kind === "target" ? "text-emerald-400" : "text-zinc-500"}`}>
                {kind === "entry" ? "" : `${kind === "target" ? "+" : "−"}$${Math.abs(val - entry).toFixed(2)}`}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <dl className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2.5 text-sm" style={{ borderColor: "var(--hairline)" }}>
        <dt className="flex items-center gap-1.5 text-zinc-400">R:R <TermHint id="rr" /></dt>
        <dd className="font-semibold text-zinc-100 tabular-nums">{rr === null ? "—" : `1 : ${rr.toFixed(1)}`}</dd>
      </dl>
    </div>
  );
}

/** The rule's conditions with how many are met. */
export function Checks({ s, t }: { s: Setup; t: T }) {
  if (s.checks.length === 0) return null;
  const met = s.checks.filter((c) => c.ok).length;
  return (
    <div className={box} style={boxStyle}>
      <h3 className="text-sm font-semibold text-zinc-300">{t(`Нөхцөл · ${met}/${s.checks.length} биелсэн`, `Conditions · ${met}/${s.checks.length} met`)}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {s.checks.map((c) => (
          <li key={c.label} className={`flex items-start gap-2.5 py-1 ${c.ok ? "text-zinc-100" : "text-zinc-500"}`}>
            <span aria-hidden className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-emerald-400" : "border-2 border-zinc-600"}`}>
              {c.ok && <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="var(--accent-fg)"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" /></svg>}
            </span>
            <span className="flex-1">{c.label}<span className="sr-only">{c.ok ? t(" (биелсэн)", " (met)") : t(" (биелээгүй)", " (not met)")}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One stretch of the rule's record: trades, share won, average R and profit factor. */
export function RecordBox({ title, h, t, note }: { title: string; h: SetupHistory | null; t: T; note?: string }) {
  return (
    <div className={box} style={boxStyle}>
      <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
      {h && <p className="text-xs text-zinc-500 tabular-nums">{t(`${h.n} арилжаа`, `${h.n} trades`)}</p>}
      {h === null ? (
        <p className="mt-3 flex flex-wrap gap-x-4 text-sm text-zinc-400"><span><Masked t={t} /> {t("ашигтай", "won")}</span><span><Masked t={t} /> {t("дундаж", "avg")}</span></p>
      ) : h.winPct === null || h.avgR === null ? (
        <p className="mt-3 text-sm text-zinc-500">{t("Дата хангалтгүй (30-аас цөөн арилжаа)", "Not enough data (fewer than 30 trades)")}</p>
      ) : (
        <>
          <div className="mt-3 flex h-1.5 gap-1" role="img" aria-label={t(`${h.winPct}% ашигтай хаагдсан`, `${h.winPct}% closed in profit`)}>
            <div className="rounded-full bg-emerald-400" style={{ width: `${h.winPct}%` }} /><div className="flex-1 rounded-full bg-red-400" />
          </div>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
            <span className="text-zinc-100">{t(`${h.winPct}% ашигтай`, `${h.winPct}% won`)}</span>
            <span className={`flex items-center gap-1 ${h.avgR > 0 ? "text-emerald-400" : h.avgR < 0 ? "text-red-400" : "text-zinc-300"}`}>{rText(h.avgR)} {t("дундаж", "avg")} <TermHint id="r" /></span>
            <span className="ml-auto flex items-center gap-1 text-zinc-500">PF {h.profitFactor === null ? "—" : h.profitFactor.toFixed(2)} <TermHint id="profit-factor" /></span>
          </p>
        </>
      )}
      {note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}
    </div>
  );
}

function RuleDetails({ s, t, extra }: { s: Setup; t: T; extra?: ReactNode }) {
  return (
    <details className="group rounded-2xl border" style={{ borderColor: "var(--hairline)" }}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium text-zinc-300 hover:text-zinc-100">
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
        {t("Дүрмийг бүтнээр нь унших", "Read the full rule")}
        <svg aria-hidden viewBox="0 0 12 12" className="ml-auto h-3 w-3 text-zinc-500 transition-transform group-open:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="px-4 pb-4">
        <p className="max-w-prose leading-relaxed text-zinc-300">{s.rule}</p>
        {extra}
      </div>
    </details>
  );
}

/** The chosen setup: what it says now, its chart with the levels, the levels and checks, its record and the rule. */
export function SetupPanel({ s, candles, v, best, records }: { s: Setup; candles: Bar[]; v: Viewer; best: { avgR: number } | null; records: { title: string; h: SetupHistory; note?: string }[] }) {
  const { t } = v;
  const done = s.result !== undefined;
  const live = s.status !== "OFF" && s.side !== null;
  const headTone = done ? (s.result! > 0 ? "text-emerald-400" : "text-red-400") : !live ? "text-zinc-100" : s.side === "BUY" ? "text-emerald-400" : "text-red-400";
  return (
    <section className="card space-y-5" aria-labelledby={`setup-h-${s.id}`}>
      {best && (
        <p className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
          <Icon name="bolt" className="h-3.5 w-3.5" />{t(`Сүүлийн 12 сард арилжаа тутмын дундаж үр дүн хамгийн өндөр (+${best.avgR.toFixed(2)}R)`, `Best average result per trade over the last 12 months (+${best.avgR.toFixed(2)}R)`)}
        </p>
      )}
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id={`setup-h-${s.id}`} className="text-base font-semibold text-zinc-100 sm:text-lg">{s.name}</h2>
          <Pill s={s} t={t} />
        </div>
        <p className={`font-display mt-3 flex items-baseline gap-2.5 text-[24px] leading-tight sm:text-[30px] ${headTone}`}>
          {(live || done) && s.side && <Dir d={s.side === "BUY" ? 1 : -1} className="text-[0.8em]" />}<span>{s.headline}</span>
        </p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-400">{s.detail}</p>
        {done && s.entry !== null && s.stop !== null && (
          <p className={`mt-2 text-sm font-semibold tabular-nums ${s.result! > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {t("Үр дүн", "Result")}: {rText(s.result!)} · 0.01 lot {s.result! > 0 ? "+" : "−"}${Math.abs(s.result! * Math.abs(s.entry - s.stop)).toFixed(2)}
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border p-3 sm:p-4" style={boxStyle}>
        <SetupChart candles={candles} side={s.side} entry={s.entry} stop={s.stop} target={s.target} band={s.band} bandLabel={bandText(s, v)} status={s.status} at={s.at ? s.at.toISOString() : null} v={v} />
      </div>
      {(s.entry !== null || s.checks.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <Ladder s={s} t={t} />
          <Checks s={s} t={t} />
        </div>
      )}
      <div className={`grid gap-3 sm:grid-cols-2 ${records.length > 2 ? "xl:grid-cols-3" : ""}`}>
        {records.map((r) => <RecordBox key={r.title} title={r.title} h={r.h} t={t} note={r.note} />)}
      </div>
      <RuleDetails s={s} t={t} extra={<p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{t("MT5 робот: Бот хуудсанд «Setup дохио» хэрэгслийг сонговол энэ болон бусад 2 setup-ийг яг энэ дүрмээр арилжаална (сешн бүрт нэг, нэг дор 3 хүртэл).", "MT5 robot: choose the “Setup signals” tool on the Bot page and it trades this and the other two setups by exactly these rules (one per session, up to three at once).")}</p>} />
    </section>
  );
}

/**
 * The panel for someone without a plan: its name, its chart of candles and the full rule stay; whether it is live, the
 * side, entry, stop, target, the checks and its record are masked (and never sent to the page).
 */
export function SetupLockedPanel({ s, candles, v }: { s: Setup; candles: Bar[]; v: Viewer }) {
  const { t } = v;
  return (
    <section className="card space-y-5" aria-labelledby={`setup-h-${s.id}`}>
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id={`setup-h-${s.id}`} className="text-base font-semibold text-zinc-100 sm:text-lg">{s.name}</h2>
          <Masked t={t} className="text-xs" />
        </div>
        <p className="mt-3 text-2xl"><Masked t={t} /></p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Одоо орох боломж бүрдсэн эсэх, чиглэл, орох үнэ, stop, target багцтай хэрэглэгчдэд харагдана.", "Whether an entry is on now, its side, entry, stop and target show with a plan.")}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border p-3 sm:p-4" style={boxStyle}>
        <SetupChart candles={candles} side={null} entry={null} stop={null} target={null} band={null} bandLabel={bandText(s, v)} v={v} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={box} style={boxStyle}>
          <h3 className="text-sm font-semibold text-zinc-300">{t("Түвшин", "Levels")}</h3>
          <dl className="mt-2 text-sm">
            {[[t("Орох", "Entry"), "entry"], ["Stop", "stop"], ["Target", "target"], ["R:R", "rr"]].map(([k, id]) => (
              <div key={id} className="flex items-baseline justify-between gap-3 py-1.5"><dt className="text-zinc-400">{k}</dt><dd><Masked t={t} /></dd></div>
            ))}
          </dl>
        </div>
        <div className="grid gap-3">
          {[t("Сүүлийн 12 сар", "Last 12 months"), t("Хадгалсан бүх дата", "All stored data")].map((title) => <RecordBox key={title} title={title} h={null} t={t} />)}
        </div>
      </div>
      <UnlockLink t={t} />
      <RuleDetails s={s} t={t} />
    </section>
  );
}

/** The live signals: closed, share won, total R and the last five with how they ended. */
export function LiveResults({ live, paid, v, now = new Date() }: { live: SignalRow[]; paid: boolean; v: Viewer; now?: Date }) {
  const { t } = v;
  const totals = outcomeTotals(live.map((r) => r.outcome));
  return (
    <section className="card flex flex-col" aria-labelledby="live-h">
      <div className="flex items-center gap-2">
        <Icon name="chart" className="h-[18px] w-[18px] text-amber-400" />
        <h2 id="live-h" className="text-base font-semibold text-zinc-100">{t("Бодит дохионы үр дүн", "Live signal results")}{paid && <span className="ml-2 text-sm font-normal text-zinc-500">({signalWindowLabel(t).toLowerCase()})</span>}</h2>
        <Link href="/bot/history" className="ml-auto text-sm font-semibold text-amber-300 hover:text-amber-200">{t("Бүх түүх", "Full history")}</Link>
      </div>
      {!paid ? <p className="mt-3 text-sm text-zinc-400">{t("Бодит дохионууд, тэдгээрийн үр дүн багцтай хэрэглэгчдэд.", "Live signals and how they ended come with a plan.")}</p>
        : live.length === 0 ? <p className="mt-3 text-sm text-zinc-400">{t("Одоогоор дохио гараагүй. Дохио бүр, TP/SL үр дүнтэйгээ энд бүртгэгдэнэ.", "No signals yet. Each one appears here with how it ended.")}</p> : (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm tabular-nums">
            <div className="glass-tile px-3 py-2"><dt className="text-xs text-zinc-500">{t("Хаагдсан", "Closed")}</dt><dd className="mt-0.5 text-lg font-semibold text-zinc-100">{totals.closed}{totals.open ? <span className="ml-1 text-xs font-normal text-zinc-500">+{totals.open}</span> : null}</dd></div>
            <div className="glass-tile px-3 py-2"><dt className="text-xs text-zinc-500">{t("Ашигтай", "Won")}</dt><dd className="mt-0.5 text-lg font-semibold text-zinc-100">{totals.winPct === null ? "—" : `${totals.winPct}%`}</dd></div>
            <div className="glass-tile px-3 py-2"><dt className="text-xs text-zinc-500">{t("Нийт", "Total")}</dt><dd className={`mt-0.5 text-lg font-semibold ${totals.totalR > 0 ? "text-emerald-400" : totals.totalR < 0 ? "text-red-400" : "text-zinc-100"}`}>{rText(totals.totalR)}</dd></div>
          </dl>
          <ul className="mt-3 divide-y text-sm" style={{ borderColor: "var(--hairline)" }}>
            {live.slice(0, 5).map((r) => {
              const o = r.outcome;
              const tone = o.kind === "OPEN" ? "text-amber-300" : (o.r ?? 0) > 0 ? "text-emerald-400" : "text-red-400";
              const word = o.kind === "WIN" ? "TP" : o.kind === "LOSS" ? "SL" : o.kind === "TIME" ? t("Цагаар", "On time") : t("Нээлттэй", "Open");
              return (
                <li key={r.id} className="flex items-center gap-3 py-2 tabular-nums" style={{ borderColor: "var(--hairline)" }}>
                  <span className="w-24 shrink-0 text-zinc-500">{stamp(v, r.createdAt, now)}</span>
                  <span className={`w-10 shrink-0 text-xs font-semibold ${r.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{r.side}</span>
                  <span className={`ml-auto font-semibold ${tone}`}>{word}{o.r !== null ? ` ${rText(o.r)}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
