import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser, findUserByEmail } from "@/lib/users";
import { prefsOf, savePrefs } from "@/lib/prefsDb";

async function user() {
  await createUser({ name: "Бат", email: "bat@example.com", password: "password123" });
  return (await findUserByEmail("bat@example.com"))!;
}

describe("saved preferences", () => {
  beforeEach(resetDb);

  it("starts as Mongolian, dark, Ulaanbaatar", async () => {
    expect(prefsOf(await user())).toEqual({ locale: "mn", theme: "dark", timeZone: "Asia/Ulaanbaatar" });
  });

  it("saves language, theme and time zone together", async () => {
    const u = await user();
    const r = await savePrefs(u.id, { locale: "en", theme: "light", timeZone: "Europe/London" });
    expect(r).toEqual({ prefs: { locale: "en", theme: "light", timeZone: "Europe/London" } });
    expect(prefsOf((await findUserByEmail("bat@example.com"))!)).toEqual({ locale: "en", theme: "light", timeZone: "Europe/London" });
  });

  it("changes only the fields that were sent", async () => {
    const u = await user();
    await savePrefs(u.id, { locale: "en", theme: "light", timeZone: "Europe/London" });
    const r = await savePrefs(u.id, { theme: "system" });
    expect(r.prefs).toEqual({ locale: "en", theme: "system", timeZone: "Europe/London" });
  });

  it("refuses a value it does not know and changes nothing", async () => {
    const u = await user();
    const r = await savePrefs(u.id, { locale: "xx", theme: "light" });
    expect(r.error).toBeTruthy();
    expect(prefsOf((await findUserByEmail("bat@example.com"))!)).toEqual({ locale: "mn", theme: "dark", timeZone: "Asia/Ulaanbaatar" });
  });
});
