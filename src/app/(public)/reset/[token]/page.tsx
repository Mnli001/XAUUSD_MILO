import Link from "next/link";
import type { Metadata } from "next";
import { getT } from "@/lib/prefs.server";
import { resetTokenValid } from "@/lib/passwordReset";
import { ResetForm } from "./ResetForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // the token is in the address: never send it on as a Referer, never index the page
  return { title: t("Нууц үг шинэчлэх", "New password"), referrer: "no-referrer", robots: { index: false, follow: false } };
}

/** Opened from the one-time link the Telegram bot sends on /reset. The token is checked again when the form is sent. */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const { token } = await params;
  const valid = await resetTokenValid(token);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm space-y-4 sm:p-6">
        <h1 className="page-title">{t("Нууц үг шинэчлэх", "Set a new password")}</h1>
        {valid ? (
          <>
            <p className="text-sm text-zinc-400">{t("Шинэ нууц үг хадгалмагц бүх төхөөрөмж дээрх нэвтрэлт хаагдана.", "Once the new password is saved, every device is signed out.")}</p>
            <ResetForm token={token} />
          </>
        ) : (
          <p role="alert" className="text-sm text-zinc-300">{t("Холбоос хүчингүй эсвэл хугацаа нь (30 минут) дууссан байна. Telegram bot-од /reset гэж дахин бичнэ үү, эсвэл админтай холбогдоно уу.", "This link is invalid or has expired (links last 30 minutes). Send /reset to the Telegram bot again, or contact the admin.")}</p>
        )}
        <p className="text-center text-sm text-zinc-400"><Link className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/login">{t("Нэвтрэх", "Sign in")}</Link></p>
      </div>
    </main>
  );
}
