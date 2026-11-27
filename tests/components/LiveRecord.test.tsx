// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { LiveRecordView } from "@/components/LiveRecordView";
import { MN_VIEWER, viewer } from "@/lib/viewer";
import type { PublicRecord } from "@/lib/publicRecord";

const base: PublicRecord = {
  mode: "DEMO", since: "2026-11-19T16:00:00.000Z", sinceDay: "2026-11-20", daysRunning: 4, startBalance: 1000, currency: "USD", updatedAt: "2026-11-23T10:00:00.000Z",
  trades: 0, wins: 0, winRate: 0, profit: 0, returnPct: 0, maxDrawdownPct: 0, series: [{ day: "2026-11-20", balance: 1000 }], lastTrades: [],
};
const withTrades: PublicRecord = {
  ...base, trades: 4, wins: 2, winRate: 50, profit: 190, returnPct: 19, maxDrawdownPct: 10,
  series: [{ day: "2026-11-20", balance: 1050 }, { day: "2026-11-21", balance: 990 }, { day: "2026-11-22", balance: 1190 }, { day: "2026-11-23", balance: 1190 }],
  lastTrades: [
    { time: "2026-11-22T03:00:00.000Z", side: "BUY", lots: 0.02, entry: 4000, exit: 4100, profit: 200 },
    { time: "2026-11-21T03:00:00.000Z", side: "SELL", lots: 0.02, entry: 4000, exit: 4030, profit: -60 },
  ],
};

test("no account chosen: a calm 'starts soon' note, not an empty box", () => {
  render(<LiveRecordView record={null} v={MN_VIEWER} />);
  expect(screen.getByTestId("live-record-placeholder")).toHaveTextContent("эхний арилжаа гармагц энд гарна");
  expect(screen.queryByTestId("live-record")).toBeNull();
});

test("chosen but no closed trade yet: the placeholder names the start date and the account type", () => {
  render(<LiveRecordView record={base} v={MN_VIEWER} />);
  const p = screen.getByTestId("live-record-placeholder");
  expect(p).toHaveTextContent("Live үр дүн 2026-11-20-нээс бүртгэгдэж эхэлсэн — эхний арилжаа гармагц энд гарна");
  expect(within(p).getByTestId("record-mode")).toHaveTextContent("Demo данс");
  expect(p).toHaveTextContent("Шинэчлэгдсэн:");
});

test("with trades: the curve, the figures, the badge and the last trades", () => {
  render(<LiveRecordView record={{ ...withTrades, mode: "REAL" }} v={MN_VIEWER} />);
  const box = screen.getByTestId("live-record");
  expect(screen.queryByTestId("live-record-placeholder")).toBeNull();
  expect(screen.getByTestId("record-mode")).toHaveTextContent("Real данс");
  expect(screen.getByTestId("record-return")).toHaveTextContent("+19.00%");
  expect(box.querySelector("svg[role=img]")).not.toBeNull();
  const figures = screen.getByLabelText("Live үр дүнгийн тоонууд");
  expect(figures).toHaveTextContent("50.0%");
  expect(figures).toHaveTextContent("−10.00%");
  expect(figures).toHaveTextContent("4"); // days running and trades
  expect(box.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(box.querySelector("tbody tr[data-result=win]")).toHaveTextContent("4000.00 → 4100.00");
  expect(box.querySelector("tbody tr[data-result=loss]")).toHaveTextContent("−$60.00");
  expect(box).toHaveTextContent("дүгнэлт хийхэд хэтэрхий эрт"); // an early sample is labelled
});

test("reads in English", () => {
  render(<LiveRecordView record={base} v={viewer({ locale: "en", timeZone: "Asia/Ulaanbaatar" })} />);
  expect(screen.getByTestId("live-record-placeholder")).toHaveTextContent("The live record started on 2026-11-20");
  expect(screen.getByTestId("record-mode")).toHaveTextContent("Demo account");
});
