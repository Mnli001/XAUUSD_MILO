"use server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "../auth";
import { getPrefs, getT, rememberPrefs } from "../prefs.server";
import { isLocale } from "../prefs";
import { prefsOf, savePrefs } from "../prefsDb";
import { findUserByEmail } from "../users";
import { registerUser } from "./register";

export type FormState = { error?: string };

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const t = await getT();
  try {
    await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirectTo: "/today" });
  } catch (e) {
    if (e instanceof AuthError) {
      if ((e as { code?: string }).code === "rate_limited") return { error: t("Хэт олон оролдлого хийлээ. 15 минутын дараа дахин оролдоно уу.", "Too many attempts. Try again in 15 minutes.") };
      return { error: t("Имэйл эсвэл нууц үг буруу байна", "Wrong email or password") };
    }
    // Signed in: this browser now remembers the account's own settings for the pages seen while signed out.
    const email = form.get("email");
    const user = typeof email === "string" ? await findUserByEmail(email) : null;
    if (user) await rememberPrefs(prefsOf(user));
    throw e; // redirect
  }
  return {};
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const r = await registerUser(form, await getT(), await getPrefs());
  if (r.error) return r;
  return loginAction({}, form);
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

/** The language switch on the pages a visitor sees before signing in. */
export async function setLocaleAction(form: FormData) {
  const locale = form.get("locale");
  if (!isLocale(locale)) return;
  await rememberPrefs({ locale });
  const { getSessionUser } = await import("../auth");
  const user = await getSessionUser();
  if (user) await savePrefs(user.id, { locale });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/", "layout");
}
