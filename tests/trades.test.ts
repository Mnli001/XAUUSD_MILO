import { listTrades, getTrade, saveTrade, deleteTrade, validateImage } from "@/lib/trades";
import type { User } from "@/lib/db/schema";
import { resetDb } from "./helpers/db";
import { makeUser } from "./helpers/users";

let alice: User, bob: User;
const validTrade = { direction: "BUY", lots: "0.1", entryPrice: "4100", exitPrice: "4110", stopLoss: "4095", takeProfit: "",
  openedAt: "2026-11-20T07:00:00Z", closedAt: "2026-11-20T08:00:00Z", note: "тест" };

beforeEach(async () => { await resetDb(); alice = await makeUser("alice@x.mn"); bob = await makeUser("bob@x.mn"); });

test("a user cannot read, edit or delete another user's trade", async () => {
  const { id } = await saveTrade(alice.id, null, validTrade);
  expect(id).toBeTruthy();
  expect(await getTrade(bob.id, id!)).toBeNull();
  expect((await saveTrade(bob.id, id!, { ...validTrade, lots: "9" })).error).toBeTruthy();
  expect(await deleteTrade(bob.id, id!)).toBe(false);
  expect((await getTrade(alice.id, id!))!.lots).toBe(0.1);
  expect(await listTrades(bob.id)).toHaveLength(0);
  expect(await listTrades(alice.id)).toHaveLength(1);
});
test("closedAt before openedAt is rejected", async () => {
  expect((await saveTrade(alice.id, null, { ...validTrade, closedAt: "2020-01-01T00:00:00Z" })).error).toBeTruthy();
});
test("exit price and close time must come together; open trades are allowed", async () => {
  expect((await saveTrade(alice.id, null, { ...validTrade, exitPrice: "" })).error).toBeTruthy();
  expect((await saveTrade(alice.id, null, { ...validTrade, closedAt: "" })).error).toBeTruthy();
  const open = await saveTrade(alice.id, null, { ...validTrade, exitPrice: "", closedAt: "", stopLoss: "" });
  expect(open.error).toBeUndefined();
  expect(await getTrade(alice.id, open.id!)).toMatchObject({ exitPrice: null, closedAt: null, stopLoss: null, takeProfit: null });
});
test("non-positive lots and prices are rejected", async () => {
  expect((await saveTrade(alice.id, null, { ...validTrade, lots: "0" })).error).toBeTruthy();
  expect((await saveTrade(alice.id, null, { ...validTrade, entryPrice: "-5" })).error).toBeTruthy();
  expect((await saveTrade(alice.id, null, { ...validTrade, direction: "HOLD" })).error).toBeTruthy();
});
test("owner can edit and delete; images are size- and type-checked", async () => {
  const { id } = await saveTrade(alice.id, null, validTrade, { bytes: Buffer.from([1, 2, 3]), mime: "image/png" });
  expect((await getTrade(alice.id, id!))!.imageMime).toBe("image/png");
  expect((await saveTrade(alice.id, id!, { ...validTrade, lots: "0.5" })).error).toBeUndefined();
  const after = await getTrade(alice.id, id!);
  expect(after!.lots).toBe(0.5);
  expect(after!.imageMime).toBe("image/png"); // kept when no new image is sent
  expect(await deleteTrade(alice.id, id!)).toBe(true);
  expect(await listTrades(alice.id)).toHaveLength(0);
  expect(validateImage({ size: 3 * 1024 * 1024, type: "image/png" })).toBe("Зураг 2MB-аас бага байх ёстой");
  expect(validateImage({ size: 10, type: "application/pdf" })).toBeTruthy();
  expect(validateImage({ size: 10, type: "image/jpeg" })).toBeNull();
});
