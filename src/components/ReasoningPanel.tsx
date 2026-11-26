"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FAMILIES, familyName, type Family, type Reading, type Verdict } from "@/lib/analysis/reasoning";
import { Masked } from "./Paywall";
import type { ReasoningView } from "@/lib/reasoningLive";
import { useViewer } from "./PrefsProvider";
import { Dir } from "./Timetable";
import { LiveBadge } from "./LiveQuote";

const REFRESH_MS = 8000;
/** How many methods are listed before "show all". */
export const FIRST_METHODS = 5;
const px = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tone = (v: Verdict) => (v === "BUY" ? "text-emerald-400" : v === "SELL" ? "text-red-400" : "text-zinc-400");
const pill = (v: Verdict) => (v === "BUY" ? "bg-emerald-500/15 text-emerald-400" : v === "SELL" ? "bg-red-500/15 text-red-400" : "bg-zinc-500/15 text-zinc-400");
const dir = (v: Verdict) => (v === "BUY" ? 1 : v === "SELL" ? -1 : 0);

/** The same read, refreshed while the page is open. */
function useReasoning(initial: ReasoningView | null): ReasoningView | null {
  const [view, setView] = useState(initial);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/reasoning", { cache: "no-store" });
        if (!res.ok) return;
        const data: { view: ReasoningView | null } = await res.json();
        if (!stop && data.view) setView(data.view);
      } catch { /* offline: the next round tries again */ }
    };
    const id = window.setInterval(tick, REFRESH_MS);
    return () => { stop = true; clearInterval(id); };
  }, []);
  return view;
}

function VerdictWord({ v }: { v: Verdict }) {
  const { t } = useViewer();
  return <>{v === "BUY" ? t("ӨСӨХ тал", "Leans UP") : v === "SELL" ? t("УНАХ тал", "Leans DOWN") : t("Саналууд зөрсөн", "Methods disagree")}</>;
}

/** One method on one line; its reasoning and levels open on a tap. */
function Row({ r }: { r: Reading }) {
  const { t } = useViewer();
  return (
    <li className="border-t first:border-t-0" style={{ borderColor: "var(--hairline)" }}>
      <details className="group/row">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-x-2.5 py-2 [&::-webkit-details-marker]:hidden">
          <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-500 transition-transform group-open/row:rotate-90"><path d="M4.5 2 8 6l-3.5 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{r.name}</h4>
          <span className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 tabular-nums" style={{ borderColor: "var(--hairline)" }}>{r.timeframe}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${pill(r.verdict)}`}><Dir d={dir(r.verdict)} />{r.verdict === "NEUTRAL" ? t("Төвийг сахисан", "Neutral") : r.verdict}</span>
        </summary>
        <div className="pb-3 pl-5">
          <p className="text-[13px] leading-relaxed text-zinc-400">{r.reason}</p>
          {r.levels.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {r.levels.map((l) => <li key={l.label} className="rounded-md px-2 py-1 text-[11px] text-zinc-400 tabular-nums" style={{ background: "var(--glass-inset)" }}>{l.label} <span className="font-medium text-zinc-200">{px(l.price)}</span></li>)}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

/**
 * How the methods traders use most read the market right now, side by side. `compact` shows only
 * the count and the families, for the Today page.
 */
export function ReasoningPanel({ initial, compact = false, narrow = false }: { initial: ReasoningView | null; compact?: boolean; narrow?: boolean }) {
  const { t, time, zone } = useViewer();
  const view = useReasoning(initial);
  const [open, setOpen] = useState<Family | "all">("all");
  const [all, setAll] = useState(false);
  if (!view) {
    return (
      <section className="card" id="reasoning">
        <h2 className="card-title">{t("Олон стратегийн дүгнэлт", "Multi-strategy read")}</h2>
        <p className="flex items-center gap-2 text-sm text-zinc-500"><span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />{t("Дата ачаалж байна", "Loading data")}</p>
      </section>
    );
  }
  const { reasoning: r, quote } = view;
  const n = r.readings.length;
  const picked = open === "all" ? r.readings : r.readings.filter((x) => x.family === open);
  // The methods that take a side come first; the full list is one tap away.
  const ranked = [...picked].sort((a, b) => Number(a.verdict === "NEUTRAL") - Number(b.verdict === "NEUTRAL"));
  const shown = all || open !== "all" ? ranked : ranked.slice(0, FIRST_METHODS);
  return (
    <section className="hallmark p-5 sm:p-7" id="reasoning" aria-labelledby="reasoning-h">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="reasoning-h" className="text-[15px] font-semibold text-zinc-100">{t("Олон стратегийн дүгнэлт", "Multi-strategy read")}</h2>
        <LiveBadge />
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className={`flex items-center gap-2.5 ${tone(r.verdict)}`}>
          <Dir d={dir(r.verdict)} className="text-[22px]" />
          <span className="font-display text-[30px] leading-none sm:text-[38px]"><VerdictWord v={r.verdict} /></span>
        </p>
        <p className="text-xs text-zinc-500 tabular-nums">XAUUSD <span className="text-zinc-200">{px(quote.price)}</span> · {time(new Date(view.computedAt))} {zone}</p>
      </div>

      <div className="mt-4">
        <div className="flex h-2 gap-1" role="img" aria-label={t(`${n} аргын ${r.buy} нь BUY, ${r.sell} нь SELL, ${r.neutral} нь төвийг сахисан`, `Of ${n} methods ${r.buy} say BUY, ${r.sell} say SELL, ${r.neutral} are neutral`)}>
          {r.buy > 0 && <div className="rounded-full bg-emerald-500" style={{ flexGrow: r.buy }} />}
          {r.neutral > 0 && <div className="rounded-full bg-zinc-600" style={{ flexGrow: r.neutral }} />}
          {r.sell > 0 && <div className="rounded-full bg-red-500" style={{ flexGrow: r.sell }} />}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums">
          <span className="text-emerald-400"><Dir d={1} /> BUY <b>{r.buy}</b></span>
          <span className="text-zinc-400"><Dir d={0} /> {t("Төвийг сахисан", "Neutral")} <b>{r.neutral}</b></span>
          <span className="text-red-400"><Dir d={-1} /> SELL <b>{r.sell}</b></span>
          <span className="text-zinc-500">{t(`нийт ${n} арга`, `${n} methods in all`)}</span>
        </p>
      </div>

      <ul className={`mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 ${narrow ? "lg:grid-cols-2" : "lg:grid-cols-6"}`}>
        {r.families.map((f) => (
          <li key={f.family}>
            <button type="button" disabled={compact} onClick={() => setOpen(open === f.family ? "all" : f.family)} aria-pressed={!compact && open === f.family}
              className={`glass-tile w-full text-left ${!compact && open === f.family ? "glass-tile-on" : ""}`}>
              <span className="block text-[11px] leading-tight text-zinc-400">{f.name}</span>
              <span className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${tone(f.verdict)}`}><Dir d={dir(f.verdict)} />{f.verdict === "NEUTRAL" ? "—" : f.verdict}<span className="ml-auto text-[11px] font-medium text-zinc-500 tabular-nums">{f.buy}↑ {f.sell}↓</span></span>
            </button>
          </li>
        ))}
      </ul>

      {compact ? (
        <p className="mt-4"><Link href="/setup#reasoning" className="btn-ghost">{t("Арга тус бүрийн тайлбарыг унших", "Read each method's reasoning")}</Link></p>
      ) : (
        <>
          {r.plan && (
            <div className="glass-inset mt-5 p-4">
              <h3 className="text-[13px] font-semibold text-zinc-200">{t("Жишиг түвшин (хэлбэлзлээр хэмжсэн)", "Reference levels (sized by volatility)")}</h3>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm tabular-nums">
                <div className="min-w-0"><dt className="text-xs text-zinc-500">{t("Одоогийн үнэ", "Price now")}</dt><dd className="mt-0.5 font-semibold text-zinc-100">{px(r.plan.entry)}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-zinc-500">Stop · {r.plan.stop < r.plan.entry ? "−" : "+"}${px(Math.abs(r.plan.entry - r.plan.stop))}</dt><dd className="mt-0.5 font-semibold text-red-400">{px(r.plan.stop)}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-zinc-500">Target · 1 : {r.plan.rr}</dt><dd className="mt-0.5 font-semibold text-emerald-400">{px(r.plan.target)}</dd></div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">{t(`Stop нь 1 цагийн ATR (${px(r.plan.atr)}$)-ийг 1.5 дахин авсан зай, target нь түүнээс 2 дахин хол. Энэ бол хэмжих шугам; шалгагдсан дүрэм биш, орох зөвлөмж биш.`, `The stop is 1.5 times the 1-hour ATR ($${px(r.plan.atr)}) away and the target twice as far. This is a ruler; it is not a tested rule and not a call to enter.`)}</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
            <h3 className="text-[13px] font-semibold text-zinc-200">{open === "all" ? t("Арга тус бүр юу харж байна", "What each method sees") : r.families.find((f) => f.family === open)?.name}</h3>
            {open !== "all" && <button type="button" className="text-xs font-medium text-amber-300 hover:text-amber-200" onClick={() => setOpen("all")}>{t("Бүгдийг харах", "Show all")}</button>}
          </div>
          <ul className="mt-2">
            {shown.map((x) => <Row key={x.id} r={x} />)}
          </ul>
          {open === "all" && ranked.length > FIRST_METHODS && (
            <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all}
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-amber-300 hover:bg-zinc-800/50 hover:text-amber-200">
              <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${all ? "rotate-180" : ""}`}><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {all ? t("Хураах", "Show less") : t(`Бүгдийг харах (${ranked.length})`, `Show all (${ranked.length})`)}
            </button>
          )}
          <details className="mt-4 max-w-prose text-xs leading-relaxed text-zinc-500">
            <summary className="cursor-pointer font-medium text-zinc-400 hover:text-zinc-200">{t("Энэ самбар системийн шийдвэрт юу хийдэг вэ?", "What does this panel do in the system's decisions?")}</summary>
            <p className="mt-2">{t("Setup дохионууд (Ази, Нью-Йорк · Setup хуудас, Telegram, MT5 роботын «Setup дохио») эдгээр аргуудын санал хураалтыг ашигладаггүй. Тэд өөрсдийн шалгагдсан дүрмээр шийднэ: өдөр, 4 цагийн тренд оноо (EMA50/200, EMA20-ийн налуу, RSI, MACD, swing бүтэц), сешний хүрээ, мэдээний цонх, хүрээний өргөн.", "The setup signals (Asia, New York · Setup page, Telegram, the MT5 robot's “Setup signals”) do not use this vote. They decide by their own tested rules: the daily and 4-hour trend scores (EMA50/200, EMA20 slope, RSI, MACD, swing structure), the session range, news windows and the range width.")}</p>
            <p className="mt-2">{t("Энэ самбарыг ашигладаг нь роботын «Дүгнэлт» горим (BUY, SELL гэсэн аргын тоогоор орно), «Day trader» горим (setup-ийн чиглэлийг олонх нь дэмжих ёстой) болон Бот хуудасны «Санал нийлэх арга» шүүлтүүр л. Бусад үед энэ нь зах зээлийг өөр өөр өнцгөөс харах лавлагаа юм.", "Only the robot's “Reading” mode (it enters on the count of methods saying BUY or SELL), its “Day trader” mode (most methods must back the setup's side) and the Bot page's “Methods that must agree” filter use this panel. Otherwise it is a reference: the market seen from many angles.")}</p>
          </details>
        </>
      )}
    </section>
  );
}

/** The multi-strategy read for someone without a plan: the method groups by name, every verdict masked, no polling. */
export function ReasoningLocked({ narrow = false }: { narrow?: boolean }) {
  const { t } = useViewer();
  return (
    <section className="hallmark p-5 sm:p-7" id="reasoning" aria-labelledby="reasoning-h">
      <h2 id="reasoning-h" className="text-[15px] font-semibold text-zinc-100">{t("Олон стратегийн дүгнэлт", "Multi-strategy read")}</h2>
      <p className="mt-4"><Masked t={t} className="text-[30px] leading-none sm:text-[38px]" /></p>
      <ul className={`mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 ${narrow ? "lg:grid-cols-2" : "lg:grid-cols-6"}`}>
        {FAMILIES.map((f) => (
          <li key={f} className="glass-tile">
            <span className="block text-[11px] leading-tight text-zinc-400">{familyName(f, t)}</span>
            <span className="mt-1 block text-sm"><Masked t={t} /></span>
          </li>
        ))}
      </ul>
      <p className="mt-4"><Link href="/plans" className="btn-ghost">{t("Багц сонгож нээх", "Choose a plan to open")}</Link></p>
    </section>
  );
}
