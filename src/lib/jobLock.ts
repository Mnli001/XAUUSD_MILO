import { db } from "./db";

/**
 * Background jobs that must run on one server instance at a time, and once per slot across all of them.
 *
 * A Postgres session-level advisory lock (pg_try_advisory_lock) is taken on a connection of its own for the whole
 * job: a second instance that ticks meanwhile does not wait, it skips. If the process dies, its connection closes and
 * the lock goes with it. Under the lock, the slot the job last ran for is read from app_state, so an instance whose
 * tick comes after another instance already finished the same slot skips it too.
 */

/** The first half of every lock key ("XAUJ"); the second is the job's own number. */
const NAMESPACE = 0x5841554a;
export const JOB_LOCK_IDS = { bootstrap: 1, fast: 2, hourly: 3, calendar: 4 } as const;
export type LockedJob = keyof typeof JOB_LOCK_IDS;

export type LockOutcome = "ran" | "busy" | "done";

type Client = { query: (q: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; release: (err?: boolean) => void };
type Pool = { connect: () => Promise<Client> };

/**
 * Runs `fn` under the job's advisory lock. "busy": another instance holds the lock; "done": this slot already ran
 * (only when a slot is given); "ran": `fn` was called (the slot is recorded before it runs, so a failing job waits for
 * its next slot instead of being retried by every instance).
 */
export async function runExclusive(job: LockedJob, slot: string | null, fn: () => Promise<void>): Promise<LockOutcome> {
  const client = await (db.$client as unknown as Pool).connect();
  let locked = false;
  try {
    const got = await client.query("SELECT pg_try_advisory_lock($1::int, $2::int) AS ok", [NAMESPACE, JOB_LOCK_IDS[job]]);
    locked = got.rows[0]?.ok === true;
    if (!locked) return "busy";
    if (slot !== null) {
      const key = `scheduler:${job}`;
      const prev = await client.query("SELECT value FROM app_state WHERE key = $1", [key]);
      if (prev.rows[0]?.value === slot) return "done";
      await client.query(
        "INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
        [key, slot],
      );
    }
    await fn();
    return "ran";
  } finally {
    let broken = false;
    if (locked) await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [NAMESPACE, JOB_LOCK_IDS[job]]).catch(() => { broken = true; });
    // a connection whose unlock failed is thrown away, which ends its session and frees the lock
    client.release(broken);
  }
}
