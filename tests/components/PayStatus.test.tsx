// @vitest-environment jsdom
import { render, screen, act } from "@testing-library/react";
import { vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { PayStatus } from "@/components/PayStatus";

beforeEach(() => { vi.useFakeTimers(); refresh.mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const answer = (status: string) => vi.fn(async (_url: string) => { void _url; return new Response(JSON.stringify({ status }), { status: 200 }); });

test("asks every 5 seconds while the payment is open, and says so", async () => {
  const f = answer("PENDING");
  vi.stubGlobal("fetch", f);
  render(<PayStatus id="p1" />);
  expect(screen.getByRole("status")).toHaveTextContent(/шалгаж/);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(f).toHaveBeenCalledTimes(2);
  expect(f.mock.calls[0][0]).toBe("/api/payments/p1");
  expect(refresh).not.toHaveBeenCalled();
});

test("when the payment is confirmed it reloads the page once and stops asking", async () => {
  const f = answer("PAID");
  vi.stubGlobal("fetch", f);
  render(<PayStatus id="p1" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(f).toHaveBeenCalledTimes(1);
});
