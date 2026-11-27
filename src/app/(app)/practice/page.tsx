import { getT } from "@/lib/prefs.server";
import { Practice } from "@/components/Practice";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Дасгал", "Practice") };
}

export default async function PracticePage() {
  const t = await getT();
  return (
    <div className="reveal space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Дасгал (bar replay)", "Practice (bar replay)")}</h1>
        <p className="page-lede">{t("Өнгөрсөн нэг өдрийг лаа лаагаар тоглуулж, мөнгө эрсдэлгүйгээр setup-аар орж дадлага хийнэ. Аль өдөр болохыг дуустал харуулахгүй.", "Replay a past day bar by bar and practise entering setups with no money at risk. Which day it is stays hidden until the end.")}</p>
      </div>
      <Practice />
    </div>
  );
}
