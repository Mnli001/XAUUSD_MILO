import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { Disclaimer } from "@/components/Disclaimer";
import { getViewer } from "@/lib/prefs.server";
import { LiveAlerts } from "@/components/LiveAlerts";
import { TelegramConfirm } from "@/components/TelegramConfirm";
import { pendingTelegram } from "@/lib/telegram";
import { hasAccess } from "@/lib/access";
import { needsConsent } from "@/lib/legal";
import { ConsentBanner } from "@/components/ConsentBanner";
import { acceptTermsAction } from "@/lib/actions/consent";
import { avatarUrl } from "@/lib/avatar";
import { ServiceWorkerSetup } from "@/components/ServiceWorkerSetup";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const v = await getViewer();
  const pending = user.telegramChatId ? null : pendingTelegram(user, new Date());
  const avatar = await avatarUrl(user.id);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppNav name={user.name} isAdmin={user.role === "ADMIN"} avatar={avatar} />
      {hasAccess(user, new Date()) && <LiveAlerts />}
      <ServiceWorkerSetup />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {needsConsent(user) && <ConsentBanner t={v.t} accept={acceptTermsAction} />}
          {pending && <TelegramConfirm name={pending.name} banner />}
          {children}
        </main>
        {/* Room for the tab bar on phones and tablets. */}
        <div className="pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0"><Disclaimer v={v} /></div>
      </div>
    </div>
  );
}
