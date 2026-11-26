import { getTodaySnapshot } from "@/lib/snapshot";
import { SYMBOL } from "@/lib/ingest/prices";
import { CandleChart } from "@/components/CandleChart";
import { getT, getViewer } from "@/lib/prefs.server";
import { SessionLine } from "@/components/SessionLine";
import { TermHint } from "@/components/TermHint";
import { requireUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { UnlockLink } from "@/components/Paywall";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Чарт — XAU Analytics", "Chart — XAU Analytics") };
}

export default async function ChartPage() {
  const v = await getViewer();
  const { t } = v;
  const paid = hasAccess(await requireUser(), new Date());
  const snap = await getTodaySnapshot(SYMBOL, new Date());
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Алтны чарт", "Gold chart")}</h1>
        <p className="page-lede">{t("XAUUSD-ийн лаа, EMA 20/50/200 шугам, өнөөдрийн R1, pivot, S1 түвшинтэй. Цагийн хүрээгээ доороос сонгоно.", "XAUUSD candles with the EMA 20/50/200 lines and today's R1, pivot and S1 levels. Pick the timeframe below.")}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500">
          <span>{t("Үгийн тайлбар:", "What the words mean:")}</span>
          <TermHint id="candle" showTerm /><TermHint id="timeframe" showTerm /><TermHint id="ema" showTerm /><TermHint id="pivot" showTerm />
        </p>
      </div>
      <section className="card py-3 sm:py-4" aria-label={t("Өнөөдрийн сешнүүд", "Today's sessions")}>
        <SessionLine now={new Date()} v={v} />
      </section>
      <CandleChart levels={paid ? snap.levels : null} />
      {!paid && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
          {t("Өнөөдрийн R1, Pivot, S1 түвшний шугам багцтай хэрэглэгчдэд харагдана.", "Today's R1, pivot and S1 lines show with a plan.")}
          <UnlockLink t={t} />
        </p>
      )}
    </div>
  );
}
