import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { Disclaimer } from "@/components/Disclaimer";
import { signalHistory, PUBLIC_DELAY_MS, type SignalRow } from "@/lib/signalHistory";
import { SignalHistoryTable, SignalTotals } from "@/components/SignalHistory";
import { getViewer } from "@/lib/prefs.server";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SessionLine } from "@/components/SessionLine";
import { getEvents } from "@/lib/events";
import { eventTitle } from "@/lib/data/calendarProvider";
import type { T } from "@/lib/i18n";
import { Dir } from "@/components/Timetable";
import { BrandName } from "@/components/BrandMark";
import { GoldField } from "@/components/GoldField";
import { PriceSpark } from "@/components/PriceSpark";
import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL, loadCandles } from "@/lib/ingest/prices";
import { biasLabelText } from "@/lib/analysis/bias";
import { SIGNAL_WINDOW, signalWindowLabel } from "@/lib/siteCopy";
import { CURVES, rrRange } from "@/lib/backtestCurves";
import { BacktestResults } from "@/components/BacktestResults";
import { BacktestNote, KeyStats, ProofLine, YearBars } from "@/components/BacktestFacts";
import { PlanFeatureList } from "@/components/PlanFeatures";
import { SignalExample, exampleSignal } from "@/components/SignalExample";
import { PLANS, PLAN_IDS, tugrik, type PlanId } from "@/lib/plans";
import type { Candle } from "@/lib/analysis/indicators";

export const dynamic = "force-dynamic";

const M15 = 15 * 6e4;
const MAX_EXAMPLE_BARS = 4000; // about six weeks of 15-minute candles

/** A section's small gold label and its headline. */
function Head({ id, eyebrow, title, lede, center = false }: { id: string; eyebrow: string; title: string; lede?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? "mx-auto text-center" : ""}>
      <p className="text-xs font-bold tracking-[0.14em] text-amber-400 uppercase">{eyebrow}</p>
      <h2 id={id} className={`font-display mt-3 text-[34px] leading-[1.06] text-zinc-50 sm:text-[48px] ${center ? "mx-auto max-w-[22ch]" : "max-w-[24ch]"}`}>{title}</h2>
      {lede && <p className={`mt-4 max-w-[60ch] text-base leading-relaxed text-zinc-400 sm:text-lg ${center ? "mx-auto" : ""}`}>{lede}</p>}
    </div>
  );
}

/** The three steps from a forming setup to a trade on the reader's own MT5. */
const steps = (t: T) => [
  [t("Дохио бүрдэнэ", "A signal forms"), t("Ази, Нью-Йоркийн нээлт, Нью-Йоркийн орой гэсэн 3 сешний хүрээг алт эвдэхэд, өдөр ба 4 цагийн trend зөвшөөрвөл setup бүрдэнэ. Дүрэм тогтмол, таамаг биш.", "When gold breaks the range of one of 3 sessions (Asia, New York open, New York late) and the daily and 4-hour trends agree, a setup forms. Fixed rules, not guesses.")],
  [t("2 минутад Telegram-д", "On Telegram within 2 minutes"), t("15 минутын лаа хаагдсанаас ~2 минутын дотор чарттай зураг, орох үнэ, stop, target бүхий текст ирнэ. Утсаараа гараар орж болно.", "Within ~2 minutes of the 15-minute candle closing, a chart picture and a text with entry, stop and target arrive. You can enter by hand from your phone.")],
  [t("Robot таны MT5 дээр арилжаална", "The robot trades it on your MT5"), t("XauBot таны сонгосон эрсдэлээр lot-оо тооцож, stop, target-тай нь автоматаар нээж, хаана. Та унтаж байсан ч.", "XauBot sizes the lot from the risk you chose and opens and closes the trade with its stop and target, automatically. Even while you sleep.")],
] as const;

/** Short questions people ask before paying, with plain answers. */
const faq = (t: T, perWeek: string, minYear: { year: number; r: string }) => [
  [t("Бусад signal group-ээс юугаараа ялгаатай вэ?", "How is this different from other signal groups?"), <>{t(`Дүрэм нь тогтмол бөгөөд 2019 оноос хойших broker-ын датан дээр шалгагдсан. Гарсан дохио бүрийн үр дүн, ашигтай нь ч алдагдалтай нь ч, энэ хуудсанд нээлттэй. Robot нь дохиог автоматаар арилжаалдаг тул орох цэгээ алдахгүй.`, `The rules are fixed and were tested on broker data since 2019. Every signal's result, winners and losers alike, is open on this page. The robot trades the signals automatically, so you never miss an entry.`)}</>],
  [t("Компьютер заавал хэрэгтэй юу?", "Do I need a computer?"), <>{t("Дохио утсан дээр Telegram-аар ирнэ, гараар арилжаалахад утас л хангалттай. Robot ажиллахын тулд MT5 Windows компьютер эсвэл Windows VPS дээр асаалттай байх ёстой (MT5-ын утасны app robot ажиллуулдаггүй). Сард ~$5–10-ийн VPS хангалттай: ", "Signals arrive on Telegram on your phone, which is enough to trade them by hand. For the robot, MT5 must stay running on a Windows PC or a Windows VPS (the MT5 phone app cannot run robots). A ~$5–10 a month VPS is enough: ")}<Link href="/guide/vps" className="font-semibold text-amber-300 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-200">{t("VPS заавар", "VPS guide")}</Link>.</>],
  [t("Хамгийн багадаа хэдэн доллараар эхлэх вэ?", "What is the minimum deposit?"), <>{t("Cent данстай бол ~$50-оос. Жижиг дансанд энгийн дансны хамгийн бага lot (0.01) хэт том эрсдэл болдог тул robot тэр арилжааг алгасна. Cent данс (жишээ нь JustMarkets Standard Cent) дээр lot 100 дахин жижиг тул сонгосон эрсдэлээрээ арилжаална.", "From ~$50 with a cent account. On a small standard account even the smallest lot (0.01) is too much risk, so the robot skips that trade. On a cent account (for example JustMarkets Standard Cent) lots are 100 times smaller, so trades keep to the risk you chose.")}</>],
  [t("Аль broker дээр ажиллах вэ?", "Which broker does it work with?"), <>{t("JustMarkets дээр туршсан. XAUUSD арилжаалдаг MT5-тай аль ч broker дээр ажиллана. Spread бага, алтны арилжааны нөхцөл сайтай broker сонгоорой.", "Tested on JustMarkets. It works with any MT5 broker that offers XAUUSD. Pick one with a low spread and good gold conditions.")}</>],
  [t("Мөнгө алдаж болох уу?", "Can I lose money?"), <>{t(`Тийм. Арилжааны бараг тал нь stop-д хүрдэг, алдагдалтай сар, жил ч байдаг (${minYear.year}: ${minYear.r}). Арилжаа бүр stop-той, эрсдэл нь дансны тогтсон хувь тул нэг арилжаагаар их алдахгүй. Эрсдэлээ та өөрөө сонгоно: бага эрсдэл = бага ашиг, бага уналт.`, `Yes. About half the trades hit their stop, and there are losing months and years (${minYear.year}: ${minYear.r}). Every trade has a stop and risks a fixed share of the account, so no single trade costs much. You choose the risk: lower risk means smaller profit and smaller falls.`)}</>],
  [t("Долоо хоногт хэдэн дохио ирэх вэ?", "How many signals a week?"), <>{t(`Дунджаар ~${perWeek}. Зарим долоо хоногт нэг ч биш, заримд 3–4. Чанартай setup-ийг хүлээдэг систем.`, `About ${perWeek} on average. Some weeks none, some 3–4. The system waits for a proper setup.`)}</>],
  [t("Төлбөрөө яаж төлөх вэ? Буцаалт бий юу?", "How do I pay? Are there refunds?"), <>{t("Төгрөгөөр, Wire-аар: QPay, банкны app, карт, Toki. Төлбөр баталгаажмагц эрх шууд нээгдэнэ. Эрх нээгдсэний дараа буцаалт хийхгүй; давхар эсвэл алдаатай гүйлгээг шалгаж буцаана. Дэлгэрэнгүй ", "In tögrög through Wire: QPay, bank apps, cards, Toki. Access opens the moment the payment is confirmed. Payments are not refunded once access has opened; a duplicate or mistaken payment is checked and returned. Details in the ")}<Link href="/terms" className="font-semibold text-amber-300 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-200">{t("үйлчилгээний нөхцөлд", "terms of service")}</Link>.</>],
  [t("Яаж эхлэх вэ?", "How do I start?"), <>{t("1) Үнэгүй бүртгүүлнэ. 2) Багцаа сонгож төлнө. 3) Тохиргоо хуудсанд Telegram-аа холбоно. 4) Bot хуудасны 3 алхмаар XauBot-оо MT5-даа холбоно. Эхлээд demo эсвэл cent дансаар туршихыг зөвлөе.", "1) Register for free. 2) Choose a plan and pay. 3) Link Telegram on the Settings page. 4) Connect XauBot to your MT5 with the 3 steps on the Bot page. We suggest trying a demo or cent account first.")}</>],
] as const;

const months: Record<PlanId, number> = { PLUS: 1, PRO: 6, MAX: 12 };

export default async function LandingPage() {
  const v = await getViewer();
  const { t } = v;
  const user = await getSessionUser();
  if (user) redirect("/today");
  const now = new Date();
  let events: Awaited<ReturnType<typeof getEvents>> = [];
  let snap: Awaited<ReturnType<typeof getTodaySnapshot>> = { price: null, bias: null, hourly: null, levels: null };
  let day: Candle[] = [];
  let record: SignalRow[] = [];
  try {
    const res = await Promise.all([
      getEvents(now, new Date(now.getTime() + 24 * 36e5)),
      getTodaySnapshot(SYMBOL, now),
      loadCandles(SYMBOL, "15min", 96),
      signalHistory(now, SIGNAL_WINDOW, { delayMs: PUBLIC_DELAY_MS }),
    ]);
    events = res[0];
    snap = res[1];
    day = res[2];
    record = res[3];
  } catch (err) {
    console.warn("[landing] DB not reachable:", (err as Error).message);
  }
  // The newest closed signal, drawn the way Telegram received it, when its candles are still stored.
  const example = exampleSignal(record);
  let exampleBars: Candle[] = [];
  if (example) {
    const need = Math.ceil((now.getTime() - example.createdAt.getTime()) / M15) + 48;
    if (need <= MAX_EXAMPLE_BARS) {
      try { exampleBars = await loadCandles(SYMBOL, "15min", need); } catch (err) { console.warn("[landing] example candles:", (err as Error).message); }
    }
  }

  const upcoming = events.filter((e) => e.impact === "HIGH");
  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const up = (snap.price?.changePct ?? 0) >= 0;
  const dir = snap.bias?.label === "ӨСӨХ хандлага" ? 1 : snap.bias?.label === "УНАХ хандлага" ? -1 : 0; // i18n-ok: compared with the stored label
  const closed = record.filter((r) => r.outcome.kind !== "OPEN");
  const sinceLaunch = record.length < SIGNAL_WINDOW;
  const perWeek = CURVES.stats.perWeek.toFixed(1);
  const [rrLo, rrHi] = rrRange();
  const fullYears = CURVES.years.filter((y) => y.trades >= 20);
  const worst = fullYears.reduce((a, b) => (b.r < a.r ? b : a), fullYears[0]);
  const minYear = { year: worst.year, r: `${worst.r < 0 ? "−" : "+"}${Math.abs(worst.r).toFixed(1)}R` };

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 overflow-x-clip">
        {/* The hero: the promise and its proof on poured gold, the live market in glass beside it. */}
        <section className="relative isolate overflow-hidden" aria-labelledby="hero-h">
          <GoldField className="gold-field absolute inset-0 -z-10 h-full w-full" />
          <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "linear-gradient(90deg, var(--color-zinc-950) 0%, color-mix(in oklab, var(--color-zinc-950) 62%, transparent) 46%, transparent 75%), linear-gradient(0deg, var(--color-zinc-950) 0%, transparent 30%)" }} />

          <header className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-8">
            <BrandName />
            <span className="flex items-center gap-2"><span className="sm:hidden"><LanguageSwitch locale={v.locale} iconOnly /></span><span className="max-sm:hidden"><LanguageSwitch locale={v.locale} /></span><Link href="/login" className="btn-ghost whitespace-nowrap backdrop-blur-md">{t("Нэвтрэх", "Sign in")}</Link></span>
          </header>

          <div className="reveal mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pt-10 pb-20 sm:px-8 sm:pt-20 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16 lg:pt-16 lg:pb-32">
            <div className="min-w-0 space-y-6">
              <p className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-amber-400/30 bg-zinc-950/60 px-4 py-2 backdrop-blur-xl">
                <span className="now-pulse h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <span className="truncate text-sm font-semibold text-amber-300">{t("XAUUSD · Telegram дохио · MT5 robot", "XAUUSD · Telegram signals · MT5 robot")}</span>
              </p>

              <h1 id="hero-h" className="font-display text-[clamp(2.4rem,5.2vw,4rem)] leading-[1.02] text-zinc-50">
                {t("Алтны дохио", "Gold signals")}{" "}<span className="whitespace-nowrap">{t("Telegram-д,", "on Telegram,")}</span>{" "}
                <span className="gold-text">{t("арилжааг robot хийнэ.", "the robot places the trade.")}</span>
              </h1>

              <p className="max-w-[48ch] text-base leading-relaxed text-zinc-300 sm:text-xl">
                {t("Тогтсон дүрмээр гарсан XAUUSD дохио чарт, орох үнэ, stop, target-тайгаа 2 минутад Telegram-д ирнэ. XauBot түүнийг таны MT5 дээр автоматаар арилжаална.", "Rule-based XAUUSD signals reach your Telegram within 2 minutes with a chart, entry, stop and target. XauBot trades them on your MT5 automatically.")}
              </p>

              <div className="glass-inset max-w-xl space-y-3 p-5 backdrop-blur-xl" style={{ background: "color-mix(in oklab, var(--color-zinc-950) 70%, transparent)" }}>
                <ProofLine t={t} />
                <BacktestNote t={t} />
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="#plans" className="btn sheen min-h-14 px-6 text-base whitespace-nowrap sm:px-9 max-sm:flex-1">{t("Багц сонгох", "Choose a plan")}</Link>
                <Link href="/register" className="btn-ghost min-h-14 bg-zinc-950/70 px-5 text-base whitespace-nowrap text-zinc-50 backdrop-blur-xl hover:bg-zinc-950/85 sm:px-8 max-sm:flex-1">{t("Үнэгүй бүртгүүлэх", "Register free")}</Link>
              </div>
            </div>

            {/* The market right now, from the same data the app reads. */}
            <aside className="min-w-0 rounded-[28px] border p-6 backdrop-blur-xl sm:p-7" aria-label={t("Одоогийн зах зээл", "The market right now")} style={{ borderColor: "var(--hairline)", background: "var(--cell-bg)", boxShadow: "var(--shadow-panel)" }}>
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-bold tracking-wider text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-400" />XAUUSD</span>
                <span className="glass-pill text-zinc-400 tabular-nums">{v.time(now)} {v.zone}</span>
              </div>
              {snap.price ? (
                <>
                  <p className="num mt-5 text-[52px] leading-none text-zinc-50 sm:text-[60px]">{money(snap.price.last)}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {snap.price.changePct !== null && (
                      <span className={`rounded-xl px-3.5 py-1.5 font-bold tabular-nums ${up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                        <Dir d={up ? 1 : -1} /> {up ? "+" : "−"}{Math.abs(snap.price.changePct).toFixed(2)}%
                      </span>
                    )}
                    {snap.bias && (
                      <span className={`rounded-xl px-3.5 py-1.5 font-bold ${dir > 0 ? "bg-emerald-500/15 text-emerald-400" : dir < 0 ? "bg-red-500/15 text-red-400" : "bg-zinc-700/50 text-zinc-300"}`}>
                        {biasLabelText(snap.bias.label, t)}
                      </span>
                    )}
                    {snap.price.stale && <span className="rounded-xl bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-300">{t("Хоцролттой", "Delayed")}</span>}
                  </div>
                  <div className="mt-5 rounded-2xl p-3" style={{ background: "var(--glass-inset)" }}><PriceSpark closes={day.map((c) => c.close)} className="h-24" /></div>
                </>
              ) : (
                <p className="mt-6 text-sm text-zinc-400">{t("Үнийн мэдээлэл түр ирээгүй байна.", "The price is not in yet.")}</p>
              )}
              <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "var(--hairline)" }}>
                <SessionLine now={now} arrivals={upcoming.map((e) => ({ time: e.time, label: eventTitle(e, t) }))} v={v} />
              </div>
            </aside>
          </div>
        </section>

        {/* If you had followed it since 2019: the one interactive part of the page. */}
        <section id="results" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-16 sm:px-8 sm:py-24" aria-labelledby="results-h">
          <Head id="results-h" eyebrow={t("Түүхэн үр дүн", "Historical results")} title={t("Хэрэв та 2019 оноос энэ системийг дагасан бол", "If you had followed this system since 2019")}
            lede={t("Эрсдэлээ сонгоод $1,500-ийн данс хэрхэн өссөнийг, замдаа хэр их уналт туулсныг хараарай. Их ашиг хүсвэл их уналтыг ч мэдэж сонгоно.", "Pick a risk and see how a $1,500 account grew, and how deep it fell on the way. Want bigger profit? Choose it knowing the bigger falls.")} />
          <div className="hallmark mt-10 p-5 sm:p-8">
            <BacktestResults curves={CURVES} />
            <BacktestNote t={t} className="mt-6 border-t pt-4" />
          </div>
        </section>

        {/* Year by year, and how the system trades. */}
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 sm:px-8 sm:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14" aria-labelledby="years-h">
          <div className="min-w-0 space-y-8">
            <Head id="years-h" eyebrow={t("Жил бүрээр", "Year by year")} title={t("Сайн жил ч, муу жил ч бий.", "Good years and flat ones.")}
              lede={t("R гэдэг нь нэг арилжаанд эрсдэлд оруулсан хэмжээ. +20R = эрсдэлийн 20 дахин их ашиг.", "R is the amount risked on one trade. +20R = twenty times that risk in profit.")} />
            <KeyStats t={t} />
          </div>
          <div className="card min-w-0">
            <YearBars t={t} />
          </div>
        </section>

        {/* How it works. */}
        <section className="border-y py-16 sm:py-24" style={{ borderColor: "var(--hairline)", background: "var(--glass-inset)" }} aria-labelledby="how-h">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
            <div className="min-w-0">
              <Head id="how-h" eyebrow={t("Яаж ажилладаг вэ", "How it works")} title={t("Дохионоос арилжаа хүртэл 3 алхам.", "From signal to trade in 3 steps.")} />
              <ol className="mt-10 space-y-7">
                {steps(t).map(([title, body], i) => (
                  <li key={title} className="flex gap-4">
                    <span aria-hidden className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg text-amber-300" style={{ borderColor: "var(--hairline-gold)" }}>{i + 1}</span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-zinc-50">{title}</h3>
                      <p className="mt-1 leading-relaxed text-zinc-400">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="min-w-0"><SignalExample row={example} bars={exampleBars} v={v} now={now} /></div>
          </div>
        </section>

        {/* The live record, a day late. */}
        {closed.length > 0 && (
          <section id="record" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 sm:py-24" aria-labelledby="record-h">
            <Head id="record-h" eyebrow={t("Бодит үр дүн", "Live record")}
              title={sinceLaunch ? t("Эхэлснээс хойшх бодит дохио бүр", "Every real signal since launch") : t(`Сүүлийн ${SIGNAL_WINDOW} бодит дохио`, `The last ${SIGNAL_WINDOW} real signals`)}
              lede={t("Backtest биш: бодитоор гарсан дохио, ашигтай нь ч алдагдалтай нь ч, яг хэрхэн дууссанаараа. Сүүлийн 24 цагийнх багцтай хэрэглэгчдэд шууд очдог тул энд нэг өдрийн дараа гарна.", "Not a backtest: the signals that actually went out, winners and losers, exactly as each one ended. The last 24 hours go to plan holders live, so they appear here a day later.")} />
            <div className="mt-10 space-y-5">
              <SignalTotals rows={record} t={t} caption={signalWindowLabel(t)} />
              <div className="table-card"><SignalHistoryTable rows={record.slice(0, 10)} v={v} now={now} /></div>
              <p className="text-sm text-zinc-500">{t("Spread, шимтгэл ороогүй. Өнгөрсөн үр дүн ирээдүйн ашгийг баталгаажуулахгүй.", "Spread and fees not included. Past results do not guarantee future profit.")}</p>
            </div>
          </section>
        )}

        {/* What a plan opens, and what it costs. */}
        <section id="plans" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-16 sm:px-8 sm:py-24" aria-labelledby="plans-h">
          <Head id="plans-h" eyebrow={t("Багц", "Plans")} title={t("Нэг багц, бүх зүйл нээлттэй.", "One plan opens everything.")}
            lede={t("Plus, Pro, Max гурвуулаа ижил боломжтой, зөвхөн хугацаа нь өөр. Урт хугацаагаар авбал сар бүр хямд.", "Plus, Pro and Max open the same things; only the length differs. A longer plan costs less a month.")} />
          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12">
            <div className="card min-w-0"><PlanFeatureList t={t} /></div>
            <ul className="grid content-start gap-3 max-lg:order-first">
              {PLAN_IDS.map((id) => {
                const p = PLANS[id];
                const perMonth = Math.round(p.amount / months[id]);
                const saving = Math.round((1 - perMonth / PLANS.PLUS.amount) * 100);
                const best = id === "PRO";
                return (
                  <li key={id} className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border p-5 ${best ? "border-amber-400/40 bg-amber-400/[0.06]" : ""}`} style={best ? undefined : { borderColor: "var(--hairline)", background: "var(--glass-inset)" }}>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-2xl text-zinc-50">{p.name} <span className="font-sans text-sm text-zinc-400">· {t(`${months[id]} сар`, `${months[id]} month${months[id] > 1 ? "s" : ""}`)}</span></h3>
                      <p className="mt-1 text-xl font-semibold text-amber-300 tabular-nums">{tugrik(p.amount)}</p>
                      <p className="text-xs text-zinc-500 tabular-nums">{months[id] > 1 ? t(`сард ${tugrik(perMonth)} · ${saving}% хэмнэлт`, `${tugrik(perMonth)} a month · ${saving}% less`) : t(`${p.days} хоног`, `${p.days} days`)}</p>
                    </div>
                    <Link href="/register" className={`${best ? "btn" : "btn-ghost"} max-sm:w-full`}>{t(`${p.name} сонгох`, `Choose ${p.name}`)}</Link>
                  </li>
                );
              })}
              <li className="px-1 text-xs leading-relaxed text-zinc-500">{t("Эхлээд үнэгүй бүртгүүлнэ, дараа нь багцаа сонгож Wire-аар (QPay, банкны app, карт, Toki) төлнө. Төлмөгц шууд нээгдэнэ.", "Register free first, then choose a plan and pay through Wire (QPay, bank apps, cards, Toki). It opens the moment you pay.")}</li>
            </ul>
          </div>
        </section>

        {/* What to expect, said plainly. */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8 sm:pb-24" aria-labelledby="expect-h">
          <div className="glass-banner p-6 sm:p-10">
            <h2 id="expect-h" className="font-display text-[30px] leading-tight text-zinc-50 sm:text-[40px]">{t("Юу хүлээх вэ", "What to expect")}</h2>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [t(`Долоо хоногт ~${perWeek} арилжаа`, `~${perWeek} trades a week`), t("Цөөн, гэхдээ тогтсон дүрмээр. Өдөр бүр дохио ирэхгүй.", "Few, but by fixed rules. Not a signal every day.")],
                [t("~50% нь ашигтай", "~50% win"), t("Бараг тал нь stop-д хүрнэ. Энэ бол хэвийн.", "About half hit their stop. That is normal.")],
                [t(`Ашиг нь алдагдлаас ${rrLo}–${rrHi} дахин их`, `Winners ${rrLo}–${rrHi}× the losers`), t("Ашиг эндээс ирдэг: цөөн ч том ашиг, жижиг алдагдал.", "That is where the profit comes from: bigger wins, small losses.")],
                [t("Жижиг данс → cent данс", "Small account → cent account"), t("Хэдэн зуун доллартай бол cent данс нээвэл lot 100 дахин жижиг болж, эрсдэл зөв тохирно.", "With a few hundred dollars, a cent account makes lots 100 times smaller so the risk fits.")],
              ].map(([h, p]) => (
                <li key={h} className="min-w-0">
                  <p className="text-lg font-semibold text-zinc-50">{h}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{p}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Questions. */}
        <section id="faq" className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-8 sm:pb-24" aria-labelledby="faq-h">
          <Head id="faq-h" eyebrow={t("Асуулт, хариулт", "Questions")} title={t("Түгээмэл асуултууд", "Common questions")} center />
          <div className="mt-10 divide-y rounded-[26px] border" style={{ borderColor: "var(--hairline)", background: "var(--panel-bg)" }}>
            {faq(t, perWeek, minYear).map(([q, a]) => (
              <details key={q} className="group px-5 sm:px-6" style={{ borderColor: "var(--hairline)" }}>
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
                  <span>{q}</span>
                  <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-amber-400 transition-transform duration-200 group-open:rotate-45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
                </summary>
                <p className="pb-5 leading-relaxed text-zinc-400">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* The last ask. */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-8 sm:pb-28" aria-labelledby="cta-h">
          <div className="sheen relative overflow-hidden rounded-[32px] px-6 py-10 sm:px-12 sm:py-14" style={{ background: "var(--accent-bg)", color: "var(--accent-fg)", boxShadow: "0 40px 100px -40px rgb(217 181 102 / 0.7)" }}>
            <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <h2 id="cta-h" className="font-display max-w-[22ch] text-[32px] leading-[1.05] sm:text-[46px]">{t("Дараагийн дохиог Telegram-аараа ав.", "Get the next signal on your Telegram.")}</h2>
                <p className="mt-3 max-w-[52ch] text-base font-medium opacity-85">{t("Бүртгэл үнэгүй. Багцаа сонгож төлмөгц дохио, robot, бүх хуудас шууд нээгдэнэ.", "Registration is free. Choose a plan and pay, and the signals, the robot and every page open at once.")}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="#plans" className="inline-flex min-h-14 items-center justify-center rounded-full bg-zinc-950 px-6 text-base font-bold whitespace-nowrap text-zinc-50 sm:px-8 transition-transform duration-200 active:scale-[0.97] max-sm:flex-1">{t("Багц сонгох", "Choose a plan")}</Link>
                <Link href="/register" className="inline-flex min-h-14 items-center justify-center rounded-full border border-current/25 px-5 text-base font-bold whitespace-nowrap sm:px-7 max-sm:flex-1">{t("Үнэгүй бүртгүүлэх", "Register free")}</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Disclaimer v={v} />
    </div>
  );
}
