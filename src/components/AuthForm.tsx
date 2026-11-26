"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction, type FormState } from "@/lib/actions/session";
import { usePrefs, useT } from "./PrefsProvider";
import { LanguageSwitch } from "./LanguageSwitch";
import { BrandName } from "./BrandMark";

/** How a user who forgot their password gets back in: the Telegram bot's /reset if it is set up, else the admin. */
export type ForgotHelp = { telegram: boolean; contact: { text: string; url: string | null } | null };

function Forgot({ help }: { help: ForgotHelp }) {
  const t = useT();
  return (
    <details className="text-sm text-zinc-400">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-zinc-200 underline decoration-amber-400/60 underline-offset-4 hover:text-zinc-50">{t("Нууц үгээ мартсан уу?", "Forgot password?")}</summary>
      <div className="mt-1 space-y-2 leading-relaxed">
        {help.telegram && <p>{t("Бүртгэлдээ Telegram холбосон бол манай Telegram ботод ", "If your account is linked to Telegram, send ")}<code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-100">/reset</code>{t(" гэж илгээнэ. Бот нууц үг шинэчлэх холбоос явуулна.", " to our Telegram bot. It replies with a link to set a new password.")}</p>}
        <p>
          {help.telegram ? t("Telegram холбоогүй бол админд хандаж нууц үгээ сэргээлгэнэ", "If Telegram is not linked, ask the admin to reset it") : t("Админд хандаж нууц үгээ сэргээлгэнэ", "Ask the admin to reset your password")}
          {help.contact ? <>: {help.contact.url ? <a className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href={help.contact.url} target="_blank" rel="noreferrer">{help.contact.text}</a> : <strong className="text-zinc-100">{help.contact.text}</strong>}.</> : t(". Бүртгүүлсэн имэйлээ хэлээрэй.", ", giving the email you registered with.")}
        </p>
      </div>
    </details>
  );
}

export function AuthForm({ mode, refCode, forgot }: { mode: "login" | "register"; refCode?: string; forgot?: ForgotHelp }) {
  const t = useT();
  const { locale } = usePrefs();
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? loginAction : registerAction, {});
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
    <div className="mb-5 flex w-full max-w-sm items-center justify-between">
      <Link href="/" aria-label="XAU Analytics"><BrandName /></Link>
      <LanguageSwitch locale={locale} />
    </div>
    <form action={action} className="card w-full max-w-sm space-y-4 pt-0 sm:p-6 sm:pt-0">
      {/* The day in miniature: the three session lines with their stations. */}
      <div aria-hidden className="relative mt-6 mb-5 flex h-3 items-center gap-1">
        <span className="h-[5px] flex-[7] rounded-full bg-asia" /><span className="h-[5px] flex-[6] rounded-full bg-london" /><span className="h-[5px] flex-[8] rounded-full bg-ny" />
        <span className="absolute left-[33%] h-[11px] w-[11px] -translate-x-1/2 rounded-full border-[3px] border-zinc-900 bg-zinc-50" />
        <span className="absolute left-[62%] h-[11px] w-[11px] -translate-x-1/2 rounded-full border-[3px] border-zinc-900 bg-zinc-50" />
      </div>
      <h1 className="page-title">{mode === "login" ? t("Нэвтрэх", "Sign in") : t("Бүртгүүлэх", "Register")}</h1>
      {mode === "register" && refCode && (
        <>
          <input type="hidden" name="ref" value={refCode} />
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">{t("Найзынхаа урилгаар бүртгүүлж байна.", "You are registering through a friend's invite.")}</p>
        </>
      )}
      {mode === "register" && (
        <div>
          <label className="label" htmlFor="name">{t("Нэр", "Name")}</label>
          <input className="input" id="name" name="name" required maxLength={80} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">{t("Имэйл", "Email")}</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">{t("Нууц үг", "Password")}</label>
        <input className="input" id="password" name="password" type="password" required minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "register" && <p className="mt-1 text-xs text-zinc-500">{t("8-аас дээш тэмдэгт", "8 characters or more")}</p>}
      </div>
      {mode === "register" && (
        <label className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-300">
          <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0 accent-amber-400" />
          <span>{t("Би ", "I have read and accept the ")}<Link href="/privacy" target="_blank" className="font-semibold text-zinc-50 underline decoration-amber-400/60 underline-offset-2">{t("Нууцлалын бодлого", "privacy policy")}</Link>{t(" болон ", " and the ")}<Link href="/terms" target="_blank" className="font-semibold text-zinc-50 underline decoration-amber-400/60 underline-offset-2">{t("Үйлчилгээний нөхцөл", "terms of service")}</Link>{t("-ийг уншиж, хувийн мэдээллээ боловсруулахыг зөвшөөрч байна.", ", and agree to my personal data being processed.")}</span>
        </label>
      )}
      {mode === "login" && forgot && <Forgot help={forgot} />}
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? t("Түр хүлээнэ үү…", "Please wait…") : mode === "login" ? t("Нэвтрэх", "Sign in") : t("Бүртгүүлэх", "Register")}</button>
      <p className="text-center text-sm text-zinc-400">
        {mode === "login" ? <>{t("Бүртгэлгүй юу?", "No account?")} <Link className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/register">{t("Бүртгүүлэх", "Register")}</Link></>
          : <>{t("Бүртгэлтэй юу?", "Already registered?")} <Link className="font-semibold text-zinc-50 underline decoration-amber-400 decoration-2" href="/login">{t("Нэвтрэх", "Sign in")}</Link></>}
      </p>
    </form>
    </main>
  );
}
