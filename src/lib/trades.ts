import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { Trade } from "./db/schema";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const price = z.coerce.number().positive("Үнэ 0-ээс их байх ёстой").finite();
const optionalPrice = z.preprocess(blankToNull, price.nullable());
const optionalDate = z.preprocess(blankToNull, z.coerce.date().nullable());

const tradeSchema = z
  .object({
    direction: z.enum(["BUY", "SELL"], { message: "Чиглэл сонгоно уу" }),
    lots: z.coerce.number().positive("Лот 0-ээс их байх ёстой").max(1000),
    entryPrice: price,
    exitPrice: optionalPrice,
    stopLoss: optionalPrice,
    takeProfit: optionalPrice,
    openedAt: z.coerce.date({ message: "Нээсэн огноо буруу байна" }),
    closedAt: optionalDate,
    note: z.preprocess(blankToNull, z.string().max(2000).nullable()),
  })
  .refine((t) => (t.exitPrice === null) === (t.closedAt === null), { message: "Гарсан үнэ, хаасан огноог хамтад нь оруулна уу" })
  .refine((t) => t.closedAt === null || t.closedAt.getTime() >= t.openedAt.getTime(), { message: "Хаасан огноо нээсэн огнооноос өмнө байж болохгүй" });

export type TradeImage = { bytes: Buffer; mime: string };

export function validateImage(file: { size: number; type: string }): string | null {
  if (file.size > MAX_IMAGE_BYTES) return "Зураг 2MB-аас бага байх ёстой";
  if (!IMAGE_TYPES.includes(file.type)) return "Зөвхөн PNG, JPEG, WebP зураг оруулна уу";
  return null;
}

const listColumns = {
  id: schema.trades.id, userId: schema.trades.userId, symbol: schema.trades.symbol, direction: schema.trades.direction,
  lots: schema.trades.lots, entryPrice: schema.trades.entryPrice, exitPrice: schema.trades.exitPrice, stopLoss: schema.trades.stopLoss,
  takeProfit: schema.trades.takeProfit, openedAt: schema.trades.openedAt, closedAt: schema.trades.closedAt, note: schema.trades.note,
  imageMime: schema.trades.imageMime,
};
export type TradeRow = Omit<Trade, "image">;

const own = (userId: string, id: string) => and(eq(schema.trades.id, id), eq(schema.trades.userId, userId));

export async function listTrades(userId: string): Promise<TradeRow[]> {
  return db.select(listColumns).from(schema.trades).where(eq(schema.trades.userId, userId)).orderBy(desc(schema.trades.openedAt));
}

export async function getTrade(userId: string, id: string): Promise<TradeRow | null> {
  const [t] = await db.select(listColumns).from(schema.trades).where(own(userId, id));
  return t ?? null;
}

export async function getTradeImage(userId: string, id: string): Promise<TradeImage | null> {
  const [t] = await db.select({ image: schema.trades.image, mime: schema.trades.imageMime }).from(schema.trades).where(own(userId, id));
  return t?.image && t.mime ? { bytes: t.image, mime: t.mime } : null;
}

/** Creates (id = null) or updates a trade owned by userId. An omitted image keeps the stored one. */
export async function saveTrade(userId: string, id: string | null, data: unknown, image?: TradeImage): Promise<{ id?: string; error?: string }> {
  const parsed = tradeSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (image) {
    const err = validateImage({ size: image.bytes.length, type: image.mime });
    if (err) return { error: err };
  }
  const values = { ...parsed.data, ...(image ? { image: image.bytes, imageMime: image.mime } : {}) };
  if (id === null) {
    const [row] = await db.insert(schema.trades).values({ ...values, userId }).returning({ id: schema.trades.id });
    return { id: row.id };
  }
  const updated = await db.update(schema.trades).set(values).where(own(userId, id)).returning({ id: schema.trades.id });
  return updated.length ? { id } : { error: "Арилжаа олдсонгүй" };
}

export async function deleteTrade(userId: string, id: string): Promise<boolean> {
  const deleted = await db.delete(schema.trades).where(own(userId, id)).returning({ id: schema.trades.id });
  return deleted.length > 0;
}
