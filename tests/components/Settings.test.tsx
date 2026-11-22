// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/actions/settings", () => ({ savePrefsAction: async () => ({}), saveSignalPrefsAction: async () => ({}), deleteAccountAction: async () => ({}) }));
vi.mock("@/lib/actions/admin", () => ({ changeNameAction: async () => ({}), changePasswordAction: async () => ({}) }));
import { AppearanceForm, TimeZoneForm, SignalPrefsForm, DeleteAccountForm } from "@/components/SettingsForms";
import { PrefsProvider } from "@/components/PrefsProvider";

const en = { locale: "en" as const, theme: "light" as const, timeZone: "Europe/London" };

test("appearance offers two languages and three themes, with the saved ones chosen", () => {
  render(<AppearanceForm prefs={{ locale: "mn", theme: "dark", timeZone: "Asia/Ulaanbaatar" }} />);
  const language = screen.getByRole("radiogroup", { name: "Хэл" });
  expect(within(language).getByRole("radio", { name: "Монгол" })).toBeChecked();
  expect(within(language).getByRole("radio", { name: "English" })).not.toBeChecked();
  const theme = screen.getByRole("radiogroup", { name: "Өнгөний горим" });
  expect(within(theme).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["dark", "light", "system"]);
  expect(within(theme).getByRole("radio", { name: "Бараан" })).toBeChecked();
});

test("in English the same form reads in English", () => {
  render(<PrefsProvider prefs={en}><AppearanceForm prefs={en} /></PrefsProvider>);
  expect(within(screen.getByRole("radiogroup", { name: "Language" })).getByRole("radio", { name: "English" })).toBeChecked();
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
  render(<SignalPrefsForm paused={false} muted={["trend-dip"]} />);
  expect(screen.getByRole("checkbox", { name: "Азийн хүрээний breakout" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Тренд доторх уналтыг авах" })).not.toBeChecked();
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
