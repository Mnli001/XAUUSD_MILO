// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/actions/settings", () => ({ savePrefsAction: async () => ({}), saveSignalPrefsAction: async () => ({}), deleteAccountAction: async () => ({}) }));
vi.mock("@/lib/actions/admin", () => ({ changeNameAction: async () => ({}), changePasswordAction: async () => ({}) }));
import { AppearanceForm, TimeZoneForm, SignalPrefsForm, DeleteAccountForm } from "@/components/SettingsForms";
import { PrefsProvider } from "@/components/PrefsProvider";

const en = { locale: "en" as const, theme: "light" as const, timeZone: "Europe/London" };

test("appearance offers twenty languages and three themes, with the saved ones chosen", () => {
  render(<AppearanceForm prefs={{ locale: "mn", theme: "dark", timeZone: "Asia/Ulaanbaatar" }} />);
  const language = screen.getByRole("combobox", { name: "Хэл" }) as HTMLSelectElement;
  expect(language.value).toBe("mn");
  expect(within(language).getAllByRole("option")).toHaveLength(20);
  expect(within(language).getByRole("option", { name: "العربية" })).toBeInTheDocument();
  const theme = screen.getByRole("radiogroup", { name: "Өнгөний горим" });
  expect(within(theme).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["dark", "light", "system"]);
  expect(within(theme).getByRole("radio", { name: "Бараан" })).toBeChecked();
});

test("in English the same form reads in English", () => {
  render(<PrefsProvider prefs={en}><AppearanceForm prefs={en} /></PrefsProvider>);
  expect((screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement).value).toBe("en");
  expect(within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: "Light" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Follow device" })).toBeInTheDocument();
});

test("the time zone list has the saved zone selected and shows each zone's offset", () => {
  render(<PrefsProvider prefs={en}><TimeZoneForm timeZone="Europe/London" now={new Date(Date.UTC(2026, 10, 24, 7, 5))} /></PrefsProvider>);
  const select = screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement;
  expect(select.value).toBe("Europe/London");
  expect(within(select).getByRole("option", { name: "(UTC+08:00) Ulaanbaatar" })).toBeInTheDocument();
  expect(within(select).getByRole("option", { name: "(UTC+05:30) Kolkata" })).toBeInTheDocument();
  expect(within(select).getByRole("option", { name: "(UTC-05:00) New York" })).toBeInTheDocument();
});

test("signal choices show each setup, with a muted one unticked, and a pause switch", () => {
  const { unmount } = render(<SignalPrefsForm paused={false} muted={[]} />);
  expect(screen.getByRole("checkbox", { name: "Азийн хүрээний breakout" })).toBeChecked();
  unmount();
  render(<SignalPrefsForm paused={false} muted={["asian-breakout"]} />);
  expect(screen.getByRole("checkbox", { name: "Азийн хүрээний breakout" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: /түр зогсоох/ })).not.toBeChecked();
});

test("deleting the account asks for the password; an admin is told it cannot be deleted", () => {
  const { rerender } = render(<DeleteAccountForm isAdmin={false} />);
  expect(screen.getByLabelText("Нууц үг")).toBeRequired();
  expect(screen.getByRole("button", { name: "Бүртгэлээ устгах" })).toBeEnabled();
  rerender(<DeleteAccountForm isAdmin />);
  expect(screen.queryByRole("button", { name: "Бүртгэлээ устгах" })).toBeNull();
  expect(screen.getByText(/Админ бүртгэлийг устгах боломжгүй/)).toBeInTheDocument();
});
