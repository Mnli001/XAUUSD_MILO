"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE } from "../prefs";

/** Puts away the "where to start" guide on Today, for this browser, for a year. */
export async function dismissStartGuide(): Promise<void> {
  (await cookies()).set(COOKIE.startDone, "1", { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  revalidatePath("/today");
}
