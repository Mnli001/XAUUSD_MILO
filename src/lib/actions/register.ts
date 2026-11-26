"use server";
import { recordConsent } from "../legal";
import { createUser, findUserByEmail } from "../users";
import { mnT, type T } from "../i18n";
import type { Prefs } from "../prefs";
import { savePrefs } from "../prefsDb";

/** `prefs`: the language, theme and time zone the visitor was already using; the new account starts with them. */
export async function registerUser(form: FormData, t: T = mnT, prefs?: Prefs): Promise<{ error?: string }> {
  // The law on personal data: written (here electronic) consent before anything is stored.
  if (form.get("consent") !== "on") return { error: t("Нууцлалын бодлого, үйлчилгээний нөхцөлийг уншиж зөвшөөрнө үү", "Please read and accept the privacy policy and the terms") };
  const r = await createUser({ name: form.get("name"), email: form.get("email"), password: form.get("password") }, "USER", t);
  if (r.error) return r;
  const email = form.get("email");
  const created = typeof email === "string" ? await findUserByEmail(email) : null;
  if (created) {
    await recordConsent(created.id);
    if (prefs) await savePrefs(created.id, prefs);
  }
  return {};
}
