import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/lib/db";
import { resetDb } from "./helpers/db";
import { upsertCandles, SYMBOL } from "@/lib/ingest/prices";
import { signalHistory } from "@/lib/signalHistory";

const M15 = 15 * 6e4;
const t0 = new Date("2026-11-25T11:47:00Z");
const bar = (i: number, high: number, low: number) => ({ time: new Date(Date.UTC(2026, 10, 25, 11, 45) + i * M15), open: 3510, high, low, close: 3510 });

beforeEach(async () => { await resetDb(); });

describe("signalHistory", () => {
  it("lists recorded signals newest first, each with how it ended on the stored candles", async () => {
    await db.insert(schema.signals).values([
      { key: "a", setupId: "asian-breakout", name: "Азийн хүрээний breakout", side: "SELL", entry: 3510.26, stop: 3544.01, target: 3442.77, createdAt: t0 },
      { key: "b", setupId: "asian-breakout", name: "Азийн хүрээний breakout", side: "BUY", entry: 3500, stop: 3490, target: 3530, createdAt: new Date(t0.getTime() + 3 * M15) },
    ]);
    await upsertCandles(SYMBOL, "15min", [bar(0, 3515, 3505), bar(1, 3515, 3505), bar(2, 3515, 3505), bar(3, 3515, 3489), bar(4, 3520, 3440)]);
    const rows = await signalHistory(new Date("2026-11-25T14:00:00Z"));
    expect(rows.map((r) => [r.key, r.outcome.kind])).toEqual([["b", "LOSS"], ["a", "WIN"]]);
  });
  it("is empty with no signals", async () => {
    expect(await signalHistory(new Date())).toEqual([]);
  });
});
