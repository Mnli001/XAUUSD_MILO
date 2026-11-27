import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { paywallFor } from "@/lib/paywall.server";
import { PlansCard } from "@/components/Paywall";
import { choosePlanAction } from "@/lib/actions/payments";
import { getDrivers } from "@/lib/drivers";
import { DriversPanel } from "@/components/DriversView";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Алтыг хөдөлгөгч хүчин", "Gold drivers") };
}

export default async function DriversPage() {
  const v = await getViewer();
  const { t } = v;
  const user = await requireUser();
  const { paid, payOn, contact } = paywallFor(user);
  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Алтыг хөдөлгөгч хүчин", "Gold drivers")}</h1>
        <p className="page-lede">{t("Доллар, бодит хүү, фьючерсийн байр: алтны урт чиглэлийг ихэвчлэн эдгээр тодорхойлдог. Өдөрт нэг удаа шинэчилнэ.", "The dollar, real yields and futures positioning: they usually set gold's longer direction. Updated once a day.")}</p>
      </div>
      {paid ? <DriversPanel d={await getDrivers(new Date())} v={v} /> : <PlansCard t={t} choose={choosePlanAction} payOn={payOn} contact={contact} />}
    </div>
  );
}
