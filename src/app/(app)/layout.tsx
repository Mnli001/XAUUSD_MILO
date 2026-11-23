import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { Disclaimer } from "@/components/Disclaimer";
import { getViewer } from "@/lib/prefs.server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const v = await getViewer();
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppNav name={user.name} isAdmin={user.role === "ADMIN"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">{children}</main>
        {/* Room for the tab bar on phones and tablets. */}
        <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0"><Disclaimer v={v} /></div>
      </div>
    </div>
  );
}
