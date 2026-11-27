import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { prefsOf } from "@/lib/prefsDb";
import { pendingTelegram, telegramConfigured } from "@/lib/telegram";
import { hasAccess } from "@/lib/access";
import { listTrades } from "@/lib/trades";
import { AppearanceForm, DeleteAccountForm, PasswordForm, SignalPrefsForm, TimeZoneForm } from "@/components/SettingsForms";
import { TelegramCard } from "@/components/TelegramCard";
import { SoundToggle } from "@/components/SoundToggle";
import { PushCard } from "@/components/PushCard";
import { pushDeviceCount, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Тохиргоо", "Settings") };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const v = await getViewer();
  const { t } = v;
  const trades = await listTrades(user.id);
  const access = user.role === "ADMIN" ? t("хугацаагүй (админ)", "no expiry (admin)") : user.accessUntil ? t(`${v.dateTime(user.accessUntil)} хүртэл (${v.zone})`, `until ${v.dateTime(user.accessUntil)} (${v.zone})`) : "—";
  const plan = user.role === "ADMIN" ? null : user.accessUntil && user.accessUntil > new Date() ? "active" : "none";
  const linked = !!user.telegramChatId;
  const devices = await pushDeviceCount(user.id);
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">{t("Тохиргоо", "Settings")}</h1>
        <p className="page-lede">{t("Хэл, өнгө, цагийн бүс энэ төхөөрөмж болон таны бүртгэлд хадгалагдана.", "Language, theme and time zone are saved to this device and to your account.")}</p>
      </div>
      <div className="grid max-w-4xl items-start gap-4 sm:gap-5 md:grid-cols-2">
        <AppearanceForm prefs={prefsOf(user)} />
        <TimeZoneForm timeZone={v.timeZone} now={new Date()} />
        <section className="card" aria-labelledby="profile-h">
          <h2 id="profile-h" className="card-title">{t("Profile", "Profile")}</h2>
          <p className="mt-2 text-sm text-zinc-300">{t("Нэр, profile зураг, багц, төлбөр, холболтууд Profile хуудсанд.", "Your name, picture, plan, payments and connections are on the Profile page.")}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("Эрхийн хугацаа", "Access")}: {access}</p>
          <Link href="/profile" className="btn-ghost mt-4">{t("Profile нээх", "Open profile")}</Link>
        </section>
        {plan && (
          <section className="card" aria-labelledby="plan-h">
            <h2 id="plan-h" className="card-title">{t("Багц", "Plan")}</h2>
            <p className="mt-2 text-sm text-zinc-300">{plan === "active" ? t("Таны багц идэвхтэй. Сунгавал үлдсэн хоног хасагдахгүй.", "Your plan is active. Renewing keeps the days left.") : t("Багцгүй үед өсөх/унах магадлал, setup, bot нууцлагдсан харагдана.", "Without a plan the odds, setups and the bot stay hidden.")}</p>
            <Link href="/plans" className="btn mt-4">{plan === "active" ? t("Багц сунгах", "Renew plan") : t("Багц сонгох", "Choose a plan")}</Link>
          </section>
        )}
        <PasswordForm />

        <div className="md:col-span-2"><SoundToggle /></div>

        <div className="space-y-4 sm:space-y-5 md:col-span-2">
          <PushCard publicKey={await vapidPublicKey()} paid={hasAccess(user, new Date())} />
          <TelegramCard configured={telegramConfigured()} linked={linked} isAdmin={user.role === "ADMIN"} paid={hasAccess(user, new Date())} pending={user.telegramChatId ? null : pendingTelegram(user, new Date())} />
          {(linked || devices > 0) && (
            <section className="card">
              <h2 className="card-title">{t("Юуг мэдэгдэх вэ", "What to notify you about")}</h2>
              <p className="mt-1 text-xs text-zinc-500">{t("Telegram болон утасны мэдэгдэлд хоёуланд нь хамаарна.", "Applies to both Telegram and phone notifications.")}</p>
              <SignalPrefsForm paused={user.signalsPaused} muted={user.signalsMuted.split(",").filter(Boolean)} news={user.signalsNews} />
            </section>
          )}
        </div>

        {trades.length > 0 && (
          <section className="card space-y-3">
            <h2 className="card-title">{t("Хуучин журналаа татах", "Download your old journal")}</h2>
            <p className="text-sm leading-relaxed text-zinc-400">{t(`Таны өмнө гараар бичсэн ${trades.length} арилжаа хадгалагдсан хэвээр. Excel-д нээгдэх CSV файл болгон татаж авна. Цаг нь ${v.zone}-аар.`, `The ${trades.length} trades you wrote down by hand earlier are still kept. Download them as a CSV file that opens in Excel. Times are in ${v.zone}.`)}</p>
            <a className="btn-ghost" href="/api/trades/export" download>{t("CSV файл татах", "Download CSV")}</a>
          </section>
        )}
        <div className="md:col-span-2">
          <DeleteAccountForm isAdmin={user.role === "ADMIN"} activeUntil={plan === "active" ? `${v.dateTime(user.accessUntil!)} (${v.zone})` : null} />
        </div>
      </div>
    </div>
  );
}
