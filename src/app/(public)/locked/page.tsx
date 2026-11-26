import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAccess } from "@/lib/access";
import { logoutAction } from "@/lib/actions/session";
import { getT } from "@/lib/prefs.server";
import { LockedCard, adminContact } from "@/components/LockedCard";

export const dynamic = "force-dynamic";

export default async function LockedPage() {
  const t = await getT();
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (hasAccess(u, new Date())) redirect("/today");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <LockedCard t={t} email={u.email} contact={adminContact({ ADMIN_CONTACT: process.env.ADMIN_CONTACT, ADMIN_CONTACT_URL: process.env.ADMIN_CONTACT_URL })} signOut={logoutAction} />
    </main>
  );
}
