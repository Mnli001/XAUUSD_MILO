import { getViewer } from "@/lib/prefs.server";
import { getRevenue } from "@/lib/revenue";
import { RevenueView } from "@/components/RevenueView";

export const dynamic = "force-dynamic";

/** Money in, who is paying, who is about to lapse and who left: the admin's view of the plans business. */
export default async function AdminRevenuePage() {
  const v = await getViewer();
  const { t } = v;
  const r = await getRevenue(new Date());
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Орлого", "Revenue")}</h1>
        <p className="page-lede">{t("Сарыг Улаанбаатарын цагаар тоолно. Дуусах гэж буй болон сунгаагүй хүмүүстэй холбогдож сануулбал сунгалт өснө.", "Months follow Ulaanbaatar time. A reminder to those about to lapse, or who did not renew, brings renewals up.")}</p>
      </div>
      <RevenueView r={r} v={v} />
    </div>
  );
}
