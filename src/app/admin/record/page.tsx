import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getViewer } from "@/lib/prefs.server";
import { listAccounts } from "@/lib/bot/liveDb";
import { getPublicRecord, publicRecordAdminView } from "@/lib/publicRecord";
import { clearPublicRecordAction } from "@/lib/actions/admin";
import { PublicRecordForm } from "@/components/PublicRecordForm";
import { LiveRecordView } from "@/components/LiveRecordView";
import { usd } from "@/lib/format";
import { ubDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function PublicRecordAdminPage() {
  const admin = await requireAdmin(); // the layout's check does not guard this page: layouts do not re-run on navigation
  const v = await getViewer();
  const { t } = v;
  const now = new Date();
  const [accounts, current, record] = await Promise.all([listAccounts(admin.id, now), publicRecordAdminView(admin.id), getPublicRecord(now)]);
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Нийтийн live үр дүн", "Public live record")}</h1>
        <p className="page-lede">{t("Нүүр хуудас болон Багц хуудсанд харагдах бодит арилжааны үр дүн. Зөвхөн таны өөрийн robot-ын дансаас сонгоно. Дансны дугаар, имэйл, token хэзээ ч гарахгүй, зөвхөн тоонууд.", "The real trading record shown on the landing and Plans pages. Pick one of your own robot accounts only. The account number, email and token never appear, only the figures.")}</p>
      </div>

      <section className="card max-w-3xl space-y-3" aria-labelledby="record-now-h">
        <h2 id="record-now-h" className="card-title">{t("Одоо сонгогдсон", "Selected now")}</h2>
        {current ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-semibold text-zinc-100" data-testid="record-selected">{current.label}</span>
            {current.mode && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${current.mode === "REAL" ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.06] text-zinc-300"}`}>{current.mode === "REAL" ? t("Real данс", "Real account") : t("Demo данс", "Demo account")}</span>}
            <span className="text-zinc-400 tabular-nums">{t("Эхэлсэн:", "Since:")} {ubDateKey(current.since)}</span>
            <span className="text-zinc-400 tabular-nums">{t("Эхлэх balance:", "Starting balance:")} {usd(current.startBalance)}</span>
            {!current.mine && <span className="text-amber-300">{t("Өөр админы данс", "Another admin's account")}</span>}
            {!current.found && <span className="text-red-400">{t("Данс олдсонгүй: нүүр хуудсанд юу ч гарахгүй", "Account not found: nothing shows on the landing page")}</span>}
            <form action={clearPublicRecordAction} className="ml-auto"><button className="btn-ghost">{t("Цуцлах", "Clear")}</button></form>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">{t("Данс сонгогдоогүй. Нүүр хуудсанд “удахгүй эхэлнэ” гэсэн тайван мэдэгдэл харагдаж байна.", "No account chosen. The landing page shows a calm “starts soon” note.")}</p>
        )}
      </section>

      <section className="card max-w-3xl space-y-3" aria-labelledby="record-pick-h">
        <h2 id="record-pick-h" className="card-title">{current ? t("Өөр данс эсвэл огноо сонгох", "Choose another account or date") : t("Данс сонгох", "Choose an account")}</h2>
        {accounts.length ? (
          <>
            <PublicRecordForm accounts={accounts.map((a) => ({ login: a.login, label: a.label, mode: a.mode }))} today={ubDateKey(now)} current={current?.mine ? current.login : undefined} />
            <p className="text-xs leading-relaxed text-zinc-500">{t("Demo/Real-ийг robot-ын мэдээлсэн дансны төрлөөс автоматаар тодорхойлно. Эхлэх balance = одоогийн balance − тэр өдрөөс хойш хаагдсан арилжааны ашиг. Эхлээд demo дансаар эхлүүлэхийг зөвлөе.", "Demo or Real is read from the account type the robot reports. Starting balance = the current balance less the profit of trades closed since that day. Start with a demo account first.")}</p>
          </>
        ) : (
          <p className="text-sm text-zinc-400">{t("Танай robot одоогоор ямар ч данснаас холбогдоогүй байна. ", "Your robot has not connected from any account yet. ")}<Link href="/bot" className="font-medium text-zinc-100 underline decoration-amber-400 decoration-2">Bot</Link>{t(" хуудаснаас XauBot-оо MT5-даа холбоно уу.", " page: connect XauBot to your MT5.")}</p>
        )}
      </section>

      <section className="hallmark max-w-3xl p-5 sm:p-6" aria-label={t("Нүүр хуудсанд хэрхэн харагдах", "How the landing page shows it")}>
        <p className="label mb-3">{t("Урьдчилж харах", "Preview")}</p>
        <LiveRecordView record={record} v={v} />
      </section>
    </div>
  );
}
