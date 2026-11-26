"use client";
import { useActionState } from "react";
import { resetPasswordAction, type ResetState } from "@/lib/actions/passwordReset";
import { useT } from "@/components/PrefsProvider";

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">{t("Шинэ нууц үг", "New password")}</label>
        <input className="input" id="password" name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" />
        <p className="mt-1 text-xs text-zinc-500">{t("8-аас дээш тэмдэгт", "8 characters or more")}</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">{t("Нууц үгээ давтана уу", "Repeat the password")}</label>
        <input className="input" id="confirm" name="confirm" type="password" required minLength={8} maxLength={200} autoComplete="new-password" />
      </div>
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? t("Түр хүлээнэ үү…", "Please wait…") : t("Нууц үг хадгалах", "Save the password")}</button>
    </form>
  );
}
