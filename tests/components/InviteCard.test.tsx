// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/components/PrefsProvider", async () => { const { mnT } = await import("@/lib/i18n"); return { useT: () => mnT }; });
import { InviteCard } from "@/components/InviteCard";

test("shows the link, copies it, and says what it has earned", async () => {
  const writeText = vi.fn(async () => {});
  Object.assign(navigator, { clipboard: { writeText } });
  render(<InviteCard link="https://site.mn/register?ref=ABCD2345" days={7} stats={{ invited: 3, paid: 1, daysEarned: 7 }} />);
  expect(screen.getByLabelText("Урилгын холбоос")).toHaveValue("https://site.mn/register?ref=ABCD2345");
  expect(screen.getByText(/\+7 хоног автоматаар нэмэгдэнэ/)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Урьсан: 3 · Багц авсан: 1 · Олсон: +7 хоног");
  fireEvent.click(screen.getByRole("button", { name: "Хуулах" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Хуулагдлаа" })).toBeInTheDocument());
  expect(writeText).toHaveBeenCalledWith("https://site.mn/register?ref=ABCD2345");
});
