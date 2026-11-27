// Applies ./drizzle migrations at deploy time (uses runtime dependencies only).
// Several instances may start together: each waits on one Postgres advisory lock, so the migrations run one at a time
// (the first applies them, the rest find nothing left to do). The lock is held by this script's own connection and
// is freed when it unlocks or its connection closes.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const LOCK = [0x5841554a, 0x4d494752]; // "XAUJ", "MIGR"

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock($1::int, $2::int)", LOCK);
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", LOCK);
  }
} finally {
  await client.end();
}
console.log("Migration дууслаа");
