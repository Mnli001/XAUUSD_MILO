import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { Trade } from "./db/schema";
import { mnT, type T } from "./i18n";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const tradeSchema = (t: T) => {
  const price = z.coerce.number().positive(t("Үнэ 0-ээс их байх ёстой", "Price must be above 0")).finite();
  const optionalPrice = z.preprocess(blankToNull, price.nullable());
  return z
  .object({
    direction: z.enum(["BUY", "SELL"], { message: t("Чиглэл сонгоно уу", "Choose a side") }),
    lots: z.coerce.number().positive(t("Лот 0-ээс их байх ёстой", "Lots must be above 0")).max(1000),
    entryPrice: price,
    exitPrice: optionalPrice,
    stopLoss: optionalPrice,
    takeProfit: optionalPrice,
    openedAt: z.coerce.date({ message: t("Нээсэн огноо буруу байна", "Invalid opening date") }),
    closedAt: z.preprocess(blankToNull, z.coerce.date().nullable()),
    note: z.preprocess(blankToNull, z.string().max(2000).nullable()),
  })
  .refine((v) => (v.exitPrice === null) === (v.closedAt === null), { message: t("Гарсан үнэ, хаасан огноог хамтад нь оруулна уу", "Enter the exit price and closing date together") })
  .refine((v) => v.closedAt === null || v.closedAt.getTime() >= v.openedAt.getTime(), { message: t("Хаасан огноо нээсэн огнооноос өмнө байж болохгүй", "The closing date cannot be before the opening date") });
};

export type TradeImage = { bytes: Buffer; mime: string };

export function validateImage(file: { size: number; type: string }, t: T = mnT): string | null {
  if (file.size > MAX_IMAGE_BYTES) return t("Зураг 2MB-аас бага байх ёстой", "The image must be under 2MB");
  if (!IMAGE_TYPES.includes(file.type)) return t("Зөвхөн PNG, JPEG, WebP зураг оруулна уу", "Only PNG, JPEG or WebP images");
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
export async function saveTrade(userId: string, id: string | null, data: unknown, image?: TradeImage, t: T = mnT): Promise<{ id?: string; error?: string }> {
  const parsed = tradeSchema(t).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (image) {
    const err = validateImage({ size: image.bytes.length, type: image.mime }, t);
    if (err) return { error: err };
  }
  const values = { ...parsed.data, ...(image ? { image: image.bytes, imageMime: image.mime } : {}) };
  if (id === null) {
    const [row] = await db.insert(schema.trades).values({ ...values, userId }).returning({ id: schema.trades.id });
    return { id: row.id };
  }
  const updated = await db.update(schema.trades).set(values).where(own(userId, id)).returning({ id: schema.trades.id });
  return updated.length ? { id } : { error: t("Арилжаа олдсонгүй", "Trade not found") };
}

export async function deleteTrade(userId: string, id: string): Promise<boolean> {
  const deleted = await db.delete(schema.trades).where(own(userId, id)).returning({ id: schema.trades.id });
  return deleted.length > 0;
}
