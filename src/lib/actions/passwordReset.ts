"use server";
import { redirect } from "next/navigation";
import { getT } from "../prefs.server";
import { resetPasswordWithToken } from "../passwordReset";
import { LIMITS, hit, requestIp } from "../rateLimit";

export type ResetState = { error?: string };

/**
 * The form on /reset/[token]: fields `token`, `password`, `confirm`. On success every session of the account
 * has ended and the visitor goes to /login?reset=1 to sign in with the new password.
 */
export async function resetPasswordAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  const t = await getT();
  const ip = await requestIp();
  if (ip !== "unknown" && !(await hit("reset-ip", ip, LIMITS.resetSubmit))) {
    return { error: t("Хэт олон оролдлого хийлээ. 15 минутын дараа дахин оролдоно уу.", "Too many attempts. Try again in 15 minutes.") };
  }
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: t("Хоёр нууц үг таарахгүй байна", "The two passwords do not match") };
  const r = await resetPasswordWithToken(token, password);
  if (r.error === "password") return { error: t("Нууц үг 8-аас дээш тэмдэгттэй байх ёстой", "Password must be 8 characters or more") };
  if (r.error) return { error: t("Холбоос хүчингүй эсвэл хугацаа нь дууссан байна. Telegram bot-од /reset гэж дахин бичнэ үү.", "This link is invalid or has expired. Send /reset to the Telegram bot again.") };
  redirect("/login?reset=1");
}
