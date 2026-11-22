import { requireUser } from "@/lib/auth";
import { SettingsForms } from "@/components/SettingsForms";
import { formatUbDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Тохиргоо — XAU Analytics" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="space-y-4">
      <h1 className="page-title">Тохиргоо</h1>
      <p className="text-sm text-zinc-400">Эрхийн хугацаа: {user.role === "ADMIN" ? "хугацаагүй (админ)" : user.accessUntil ? `${formatUbDateTime(user.accessUntil)} хүртэл (УБ)` : "—"}</p>
      <SettingsForms name={user.name} email={user.email} />
    </div>
  );
}
