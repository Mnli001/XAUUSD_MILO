import { ubHour, ubDateKey, sessionOfUbHour } from "@/lib/time";

test("UB time helpers", () => {
  const d = new Date("2026-11-20T18:30:00Z"); // 02:30 next day in UB
  expect(ubHour(d)).toBe(2);
  expect(ubDateKey(d)).toBe("2026-11-21");
  expect(sessionOfUbHour(9)).toBe("Ази");
  expect(sessionOfUbHour(16)).toBe("Лондон");
  expect(sessionOfUbHour(22)).toBe("Нью-Йорк");
  expect(sessionOfUbHour(3)).toBe("Нью-Йорк");
  expect(sessionOfUbHour(6)).toBe("Завсар");
});
