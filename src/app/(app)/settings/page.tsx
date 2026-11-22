import { requireUser } from "@/lib/auth";
import { getT, getViewer } from "@/lib/prefs.server";
import { prefsOf } from "@/lib/prefsDb";
import { telegramConfigured } from "@/lib/telegram";
import { listTrades } from "@/lib/trades";
import { logoutAction } from "@/lib/actions/session";
import { AppearanceForm, DeleteAccountForm, PasswordForm, ProfileForm, SignalPrefsForm, TimeZoneForm } from "@/components/SettingsForms";
import { TelegramCard } from "@/components/TelegramCard";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Тохиргоо — XAU Analytics", "Settings — XAU Analytics") };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const v = await getViewer();
  const { t } = v;
  const trades = await listTrades(user.id);
  const access = user.role === "ADMIN" ? t("хугацаагүй (админ)", "no expiry (admin)") : user.accessUntil ? t(`${v.dateTime(user.accessUntil)} хүртэл (${v.zone})`, `until ${v.dateTime(user.accessUntil)} (${v.zone})`) : "—";
  const linked = !!user.telegramChatId;
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("Тохиргоо", "Settings")}</h1>
      <div className="grid max-w-4xl items-start gap-4 md:grid-cols-2">
        <AppearanceForm prefs={prefsOf(user)} />
        <TimeZoneForm timeZone={v.timeZone} now={new Date()} />
        <ProfileForm name={user.name} email={user.email} access={access} />
        <PasswordForm />

        <div className="space-y-4 md:col-span-2">
          <TelegramCard configured={telegramConfigured()} linked={linked} isAdmin={user.role === "ADMIN"} />
          {linked && (
            <section className="card">
              <h2 className="card-title">{t("Telegram мэдэгдэл", "Telegram notifications")}</h2>
              <SignalPrefsForm paused={user.signalsPaused} muted={user.signalsMuted.split(",").filter(Boolean)} />
            </section>
          )}
        </div>

        <section className="card space-y-3">
          <h2 className="card-title">{t("Журнал татах", "Export the journal")}</h2>
          <p className="text-sm leading-relaxed text-zinc-400">{t(`Журналд байгаа ${trades.length} арилжааг Excel-д нээгдэх CSV файл болгон татна. Цаг нь ${v.zone}-аар, ашиг болон R тооцоотой.`, `Downloads the ${trades.length} trades in your journal as a CSV file that opens in Excel. Times are in ${v.zone}, with profit and R worked out.`)}</p>
          {trades.length > 0
            ? <a className="btn-ghost" href="/api/trades/export" download>{t("CSV файл татах", "Download CSV")}</a>
            : <p className="text-sm text-zinc-500">{t("Журнал хоосон байна.", "The journal is empty.")}</p>}
        </section>
        <section className="card space-y-3">
          <h2 className="card-title">{t("Энэ төхөөрөмж", "This device")}</h2>
          <p className="text-sm leading-relaxed text-zinc-400">{t("Гарсны дараа дахин нэвтрэхэд таны хэл, өнгөний горим, цагийн бүс хэвээр байна.", "After signing out, your language, theme and time zone are kept for the next sign-in.")}</p>
          <form action={logoutAction}><button className="btn-ghost">{t("Гарах", "Sign out")}</button></form>
        </section>

        <div className="md:col-span-2"><DeleteAccountForm isAdmin={user.role === "ADMIN"} /></div>
      </div>
    </div>
  );
}
