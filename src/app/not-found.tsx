import Link from "next/link";
import { ErrorScreen } from "@/components/ErrorScreen";
import { getSessionUser } from "@/lib/auth";
import { getViewer } from "@/lib/prefs.server";

export async function generateMetadata() {
  const { t } = await getViewer();
  return { title: t("Хуудас олдсонгүй", "Page not found") };
}

/** Any unknown address, and every notFound() (a payment that is not yours, say). */
export default async function NotFound() {
  const { t } = await getViewer();
  const user = await getSessionUser().catch(() => null);
  return (
    <ErrorScreen
      code="404"
      title={t("Хуудас олдсонгүй", "Page not found")}
      body={t("Энэ хаягаар хуудас байхгүй, эсвэл танд харагдах эрхгүй байна. Холбоосоо шалгаад дахин оролдоно уу.", "There is no page at this address, or it is not yours to see. Check the link and try again.")}
      actions={user
        ? <><Link href="/today" className="btn">{t("Өнөөдөр хуудас руу", "Go to Today")}</Link><Link href="/setup" className="btn-ghost">Setup</Link></>
        : <><Link href="/" className="btn">{t("Нүүр хуудас руу", "Go to the home page")}</Link><Link href="/login" className="btn-ghost">{t("Нэвтрэх", "Sign in")}</Link></>}
    />
  );
}
