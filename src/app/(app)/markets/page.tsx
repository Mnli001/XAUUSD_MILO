import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { loadMarket } from "@/lib/markets";
import { GOLD, MARKETS, digitsOf, isAlertSymbol, marketName } from "@/lib/marketList";
import { MarketCards } from "@/components/MarketsView";
import { MarketChart } from "@/components/MarketChart";
import { PriceAlertsCard, type AlertRow } from "@/components/PriceAlertsCard";
import { MAX_ACTIVE_ALERTS, listPriceAlerts } from "@/lib/priceAlerts";
import { pushDeviceCount } from "@/lib/push";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Бусад зах зээл", "Other markets") };
}

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { paid, payOn, contact } = paywallFor(user);
  const head = (
    <div>
      <h1 className="page-title">{t("Бусад зах зээл", "Other markets")}</h1>
      <p className="page-lede">{t("Мөнгө, евро, Nasdaq, bitcoin: алттай зэрэгцүүлэн чиглэл, өчигдрийн хүрээ, 1 цагийн чарт. Цаг тутам шинэчилнэ. Setup болон robot зөвхөн алтан дээр ажиллана.", "Silver, the euro, Nasdaq and bitcoin next to gold: direction, yesterday's range and an hourly chart. Updated every hour. Setups and the robot work on gold only.")}</p>
    </div>
  );
  if (!paid) return <div className="reveal space-y-4 sm:space-y-5">{head}<PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} /></div>;

  const { s } = await searchParams;
  const selected = isAlertSymbol(s) ? s : MARKETS[0].symbol;
  const now = new Date();
  const symbols = [GOLD, ...MARKETS.map((m) => m.symbol)];
  const loaded = await Promise.all(symbols.map(async (symbol) => ({ symbol, ...(await loadMarket(symbol, now, symbol === selected ? 600 : 0)) })));
  const current = loaded.find((m) => m.symbol === selected)!;
  const [alertRows, devices] = selected === GOLD ? [[], 0] : await Promise.all([listPriceAlerts(user.id, selected), pushDeviceCount(user.id)]);
  const alerts: AlertRow[] = alertRows.map((a) => ({ id: a.id, level: a.level, direction: a.direction === "above" ? "above" : "below", set: v.dateTime(a.createdAt), fired: a.triggeredAt ? v.dateTime(a.triggeredAt) : null, firedPrice: a.triggeredPrice }));
  const name = marketName(selected, t);

  return (
    <div className="reveal space-y-4 sm:space-y-5">
      {head}
      <MarketCards v={v} selected={selected} items={loaded.map(({ symbol, view }) => ({ symbol, view }))} />
      <section id="chart" className="card scroll-mt-24" aria-label={t(`${name}: 1 цагийн чарт`, `${name}: hourly chart`)}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="card-title">{t(`${name} · 1 цагийн чарт, EMA 50`, `${name} · hourly chart, EMA 50`)}</h2>
          {selected === GOLD && <Link href="/chart" className="text-sm font-semibold text-amber-300 hover:text-amber-200">{t("Алтны бүрэн чарт", "Gold's full chart")}</Link>}
        </div>
        {current.chart.length
          ? <MarketChart bars={current.chart.map((c) => ({ time: c.time.getTime(), open: c.open, high: c.high, low: c.low, close: c.close }))} digits={digitsOf(selected)} label={t(`${name}-ийн 1 цагийн лаанууд`, `${name} hourly candles`)} />
          : <p className="text-sm text-zinc-500">{t("Өгөгдөл хараахан ирээгүй. Цаг тутам шинэчилнэ.", "No data yet. It updates every hour.")}</p>}
      </section>
      {selected !== GOLD && (
        <PriceAlertsCard alerts={alerts} price={current.view?.price ?? null} channels={{ telegram: !!user.telegramChatId, push: devices > 0 }} max={MAX_ACTIVE_ALERTS} symbol={selected} name={name} />
      )}
    </div>
  );
}
