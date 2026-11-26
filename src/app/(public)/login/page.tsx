import { AuthForm } from "@/components/AuthForm";
import { getT } from "@/lib/prefs.server";
import { telegramConfigured } from "@/lib/telegram";
import { siteAdminContact } from "@/lib/contact";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Нэвтрэх", "Sign in") };
}
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const [{ reset }, t] = await Promise.all([searchParams, getT()]);
  return (
    <>
      {reset === "1" && (
        <p role="status" className="mx-auto mt-6 max-w-sm rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {t("Нууц үг солигдлоо. Шинэ нууц үгээрээ нэвтэрнэ үү.", "Password changed. Sign in with your new password.")}
        </p>
      )}
      <AuthForm mode="login" forgot={{ telegram: telegramConfigured(), contact: siteAdminContact() }} />
    </>
  );
}
