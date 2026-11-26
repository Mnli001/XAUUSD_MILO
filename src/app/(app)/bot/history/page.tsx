import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { signalHistory, PUBLIC_DELAY_MS } from "@/lib/signalHistory";
import { SignalHistoryTable, SignalTotals } from "@/components/SignalHistory";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Ботын түүх — XAU Analytics", "Bot history — XAU Analytics") };
}

/** Every setup signal the site, Telegram and the robot acted on, and how each one ended. */
export default async function BotHistoryPage() {
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const { paid, payOn, contact } = paywallFor(await requireUser(), now);
  // Without a plan the same record shows, a day late.
  const rows = await signalHistory(now, 60, paid ? {} : { delayMs: PUBLIC_DELAY_MS });
  return (
    <div className="reveal space-y-5 sm:space-y-7">
      <div>
        <h1 className="page-title">{t("Ботын түүх", "Bot history")}</h1>
        <p className="page-lede mt-3">{t("Setup-ийн гаргасан дохио бүр болон хэрхэн дууссан нь. Ногоон: ашигтай хаагдсан, улаан: алдагдалтай хаагдсан. Target, Stop: аль нь эхэлж хүрсэн; Цагаар: аль нь ч хүрээгүй, цагаар хаагдсан.", "Every signal the setups gave and how it ended. Green: closed in profit, red: closed at a loss. Target, Stop: which was reached first; On time: neither, closed at the set hour.")}</p>
      </div>
      {!paid && <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} compact />}
      <SignalTotals rows={rows} t={t} />
      <section className="table-card" aria-labelledby="signals-h">
        <h2 id="signals-h" className="px-4 pt-4 pb-2 text-[15px] font-semibold text-zinc-100 sm:px-5 sm:pt-5">{t("Сүүлийн дохионууд", "Recent signals")}</h2>
        {!paid && <p className="px-4 pb-2 text-sm text-zinc-400 sm:px-5">{t("Сүүлийн 24 цагийн дохио (орох, stop, target-тай нь) багцтай хэрэглэгчдэд шууд, Telegram-аар ирнэ. Энд түүнээс өмнөх бүх дохио үр дүнтэйгээ харагдаж байна.", "Signals from the last 24 hours (with entry, stop and target) reach plan holders live and on Telegram. Everything older is here with its result.")}</p>}
        <SignalHistoryTable rows={rows} v={v} />
      </section>
      <p className="max-w-prose text-xs leading-relaxed text-zinc-500">
        {t(`Үр дүнг хадгалсан 15 минутын лаан дээр Setup-ийн дүрмээр тооцсон: эхэлж хүрсэн нь stop эсвэл target, нэг лаа хоёуланд нь хүрвэл stop-д тооцно. Азийн breakout ${v.ub("04:00")} (${v.zone}) гэхэд аль нь ч хүрээгүй бол тэр үеийн үнээр хаагдана. R нь эрсдэлийн нэгж (stop хүртэлх зай). Spread, шимтгэл ороогүй; бодит арилжааны үр дүн бага зэрэг өөр байж болно. Санхүүгийн зөвлөгөө биш.`,
          `Results are worked out on the stored 15-minute candles with the Setup rules: whichever of the stop or the target is touched first, and a candle touching both counts as the stop. An Asian breakout that reaches neither by ${v.ub("04:00")} (${v.zone}) is closed at that price. R is the unit of risk (the distance to the stop). Spread and fees are not included, so real trades can differ a little. Not financial advice.`)}
      </p>
    </div>
  );
}
