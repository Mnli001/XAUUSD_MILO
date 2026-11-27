import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { parseDrawings, type Drawing } from "./chartDraw";

export async function loadDrawings(userId: string): Promise<Drawing[]> {
  const [row] = await db.select({ data: schema.chartDrawings.data }).from(schema.chartDrawings).where(eq(schema.chartDrawings.userId, userId));
  return parseDrawings(row?.data ?? []);
}

/** Replaces the member's drawings with the checked list; returns what was kept. */
export async function saveDrawings(userId: string, raw: unknown, now = new Date()): Promise<Drawing[]> {
  const data = parseDrawings(raw);
  await db.insert(schema.chartDrawings).values({ userId, data, updatedAt: now })
    .onConflictDoUpdate({ target: schema.chartDrawings.userId, set: { data, updatedAt: now } });
  return data;
}
