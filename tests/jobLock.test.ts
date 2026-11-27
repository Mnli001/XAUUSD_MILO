import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { runExclusive } from "@/lib/jobLock";
import { run, runJob, slotOf } from "@/lib/scheduler";

const clearSlots = () => db.execute(sql`DELETE FROM app_state WHERE key LIKE 'scheduler:%'`);
beforeEach(clearSlots);
afterEach(async () => { await clearSlots(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("runExclusive", () => {
  it("lets one caller run a job while a second one, at the same time, skips it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let runs = 0;
    const first = runExclusive("fast", null, async () => { runs++; await gate; });
    await new Promise((r) => setTimeout(r, 50)); // the first one holds the lock now
    expect(await runExclusive("fast", null, async () => { runs++; })).toBe("busy");
    release();
    expect(await first).toBe("ran");
    expect(runs).toBe(1);
    // the lock is free again afterwards, and other jobs never waited on it
    expect(await runExclusive("fast", null, async () => { runs++; })).toBe("ran");
    expect(runs).toBe(2);
  });

  it("different jobs do not block each other", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fast = runExclusive("fast", null, () => gate);
    await new Promise((r) => setTimeout(r, 50));
    expect(await runExclusive("hourly", null, async () => {})).toBe("ran");
    release();
    await fast;
  });

  it("runs a slot once across instances, and frees the lock when the job throws", async () => {
    const fn = vi.fn(async () => {});
    expect(await runExclusive("hourly", "2026-11-27T10", fn)).toBe("ran");
    expect(await runExclusive("hourly", "2026-11-27T10", fn)).toBe("done");
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(runExclusive("hourly", "2026-11-27T11", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await runExclusive("hourly", "2026-11-27T11", fn)).toBe("done"); // marked before it ran: not retried by others
    expect(await runExclusive("hourly", "2026-11-27T12", fn)).toBe("ran");
  });
});

describe("scheduler", () => {
  it("runJob runs each job's slot once", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const now = new Date("2026-11-27T10:16:00Z");
    const work = vi.fn(async () => {});
    expect(await runJob("fast", now, work)).toBe("ran");
    expect(await runJob("fast", new Date("2026-11-27T10:20:00Z"), work)).toBe("done");
    expect(await runJob("fast", new Date("2026-11-27T10:31:00Z"), work)).toBe("ran");
    expect(work).toHaveBeenCalledTimes(2);
    expect(slotOf("calendar", now)).toBe("2026-11-27");
  });

  it("the hourly job prunes old rate-limit counters", async () => {
    vi.stubEnv("TWELVEDATA_API_KEY", "");
    vi.stubEnv("FRED_API_KEY", "");
    const now = new Date("2026-11-27T10:01:00Z");
    await db.execute(sql`DELETE FROM rate_limits WHERE key LIKE 'joblock-test:%'`);
    await db.execute(sql`INSERT INTO rate_limits (key, count, window_start) VALUES ('joblock-test:old', 3, ${new Date(now.getTime() - 2 * 864e5)}), ('joblock-test:new', 1, ${now})`);
    await run("hourly", now);
    const left = await db.execute<{ key: string }>(sql`SELECT key FROM rate_limits WHERE key LIKE 'joblock-test:%'`);
    expect(left.rows.map((r) => r.key)).toEqual(["joblock-test:new"]);
    await db.execute(sql`DELETE FROM rate_limits WHERE key LIKE 'joblock-test:%'`);
  });
});
