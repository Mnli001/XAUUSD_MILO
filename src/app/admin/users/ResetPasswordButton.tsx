"use client";
import { useActionState } from "react";
import { resetUserPasswordAction, type AdminState } from "@/lib/actions/admin";
import { useT } from "@/components/PrefsProvider";

/**
 * Admin-assisted password reset (there is no email): asks first, then shows the temporary password once.
 * The user's sessions all end; they sign in with it and change it on Settings.
 */
export function ResetPasswordButton({ userId, email, className = "" }: { userId: string; email: string; className?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<AdminState, FormData>(resetUserPasswordAction, {});
  return (
    <div className={className}>
      <form action={action} onSubmit={(e) => { if (!window.confirm(t(`${email}-ийн нууц үгийг шинэчилж, бүх нэвтрэлтийг хаах уу?`, `Reset the password of ${email} and sign them out everywhere?`))) e.preventDefault(); }}>
        <input type="hidden" name="userId" value={userId} />
        <button className="btn-ghost w-full whitespace-nowrap" disabled={pending}>{t("Нууц үг шинэчлэх", "Reset password")}</button>
      </form>
      {state.error && <p role="alert" className="mt-1 text-xs text-red-400">{state.error}</p>}
      {state.password && (
        <p role="status" className="mt-1 max-w-xs text-xs whitespace-normal text-zinc-300">
          {state.ok} <code className="select-all rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-sm text-amber-300">{state.password}</code>
        </p>
      )}
    </div>
  );
}
