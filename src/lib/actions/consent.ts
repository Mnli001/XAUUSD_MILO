"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { recordConsent } from "../legal";

/** An existing user accepts the current privacy policy and terms from the banner in the app. */
export async function acceptTermsAction(): Promise<void> {
  const user = await requireUser();
  await recordConsent(user.id);
  revalidatePath("/", "layout");
}
