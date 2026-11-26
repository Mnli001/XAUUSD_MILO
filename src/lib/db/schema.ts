import { pgTable, pgEnum, boolean, text, timestamp, doublePrecision, integer, jsonb, primaryKey, index, uniqueIndex, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const roleEnum = pgEnum("role", ["USER", "ADMIN"]);
export const directionEnum = pgEnum("direction", ["BUY", "SELL"]);
export const impactEnum = pgEnum("impact", ["HIGH", "MEDIUM", "LOW"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("USER"),
  accessUntil: ts("access_until"),
  telegramChatId: text("telegram_chat_id"), // where setup signals are sent
  telegramLinkCode: text("telegram_link_code"), // one-time code the user presses Start with
  telegramLinkExpiresAt: ts("telegram_link_expires_at"), // the code above stops working after this
  telegramPendingChatId: text("telegram_pending_chat_id"), // a chat that gave this account's email to the bot and waits for a yes on the site
  telegramPendingName: text("telegram_pending_name"), // how that chat calls itself, shown beside the yes/no
  telegramPendingExpiresAt: ts("telegram_pending_expires_at"), // the request above lapses after this
  signalsPaused: boolean("signals_paused").notNull().default(false), // Telegram stays linked, nothing is sent
  signalsMuted: text("signals_muted").notNull().default(""), // setup ids this user does not want, comma separated
  signalsNews: boolean("signals_news").notNull().default(false), // a Telegram heads-up before HIGH-impact releases (opt-in)
  locale: text("locale").notNull().default("mn"),
  theme: text("theme").notNull().default("dark"),
  timeZone: text("time_zone").notNull().default("Asia/Ulaanbaatar"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const candles = pgTable("candles", {
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  time: ts("time").notNull(),
  open: doublePrecision("open").notNull(),
  high: doublePrecision("high").notNull(),
  low: doublePrecision("low").notNull(),
  close: doublePrecision("close").notNull(),
}, (t) => [primaryKey({ columns: [t.symbol, t.timeframe, t.time] })]);

export const biasSnapshots = pgTable("bias_snapshots", {
  id: id(),
  symbol: text("symbol").notNull(),
  computedAt: ts("computed_at").notNull().defaultNow(),
  total: doublePrecision("total").notNull(),
  buyerPct: integer("buyer_pct").notNull(),
  label: text("label").notNull(),
  perTimeframe: jsonb("per_timeframe").notNull(),
  levels: jsonb("levels"),
  hourly: jsonb("hourly").notNull(),
}, (t) => [index("bias_symbol_time").on(t.symbol, t.computedAt)]);

export const economicEvents = pgTable("economic_events", {
  id: id(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  country: text("country").notNull(),
  impact: impactEnum("impact").notNull(),
  time: ts("time").notNull(),
  forecast: text("forecast"),
  previous: text("previous"),
  actual: text("actual"),
  source: text("source").notNull(),
  alertedAt: ts("alerted_at"), // when the Telegram "news soon" heads-up went out, so it goes out once
}, (t) => [uniqueIndex("event_type_time").on(t.type, t.time), index("event_time").on(t.time)]);

export const eventReactions = pgTable("event_reactions", {
  type: text("type").primaryKey(),
  n: integer("n").notNull(),
  stats: jsonb("stats").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const trades = pgTable("trades", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull().default("XAUUSD"),
  direction: directionEnum("direction").notNull(),
  lots: doublePrecision("lots").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  exitPrice: doublePrecision("exit_price"),
  stopLoss: doublePrecision("stop_loss"),
  takeProfit: doublePrecision("take_profit"),
  openedAt: ts("opened_at").notNull(),
  closedAt: ts("closed_at"),
  note: text("note"),
  image: bytea("image"),
  imageMime: text("image_mime"),
}, (t) => [index("trade_user_opened").on(t.userId, t.openedAt)]);

export const botState = pgTable("bot_state", {
  id: text("id").primaryKey(), // "paper"
  startedAt: ts("started_at").notNull(),
  startBalance: doublePrecision("start_balance").notNull().default(10000),
});

/** A user's link to their robot: one token, whichever MT5 account the robot is signed in to. */
export const botTokens = pgTable("bot_tokens", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash"),
}, (t) => [uniqueIndex("bot_tokens_token_hash").on(t.tokenHash)]);

/** One bot per MT5 account of a user. login "" is a bot set up before any account connected. */
export const botLive = pgTable("bot_live", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  login: text("login").notNull().default(""),
  server: text("server"), // broker server name, from robot v2.41
  state: text("state").notNull().default("STOPPED"),
  runId: text("run_id"),
  closeAll: boolean("close_all").notNull().default(false),
  config: jsonb("config").notNull(),
  startedAt: ts("started_at"),
  stoppedAt: ts("stopped_at"),
  stopReason: text("stop_reason"),
  lastSeenAt: ts("last_seen_at"),
  status: jsonb("status"),
}, (t) => [primaryKey({ columns: [t.userId, t.login] })]);

export const botDeals = pgTable("bot_deals", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  login: text("login").notNull().default(""),
  ticket: text("ticket").notNull(), // broker ticket; only unique per account
  runId: text("run_id"),
  side: text("side").notNull(),
  lots: doublePrecision("lots").notNull(),
  openPrice: doublePrecision("open_price").notNull(),
  closePrice: doublePrecision("close_price").notNull(),
  profit: doublePrecision("profit").notNull(),
  closeTime: ts("close_time").notNull(),
  position: text("position"), // the position the deal closed (robot v3.10+): joins it to bot_entries
}, (t) => [primaryKey({ columns: [t.userId, t.login, t.ticket] }), index("bot_deals_user_close").on(t.userId, t.login, t.closeTime)]);

/** A setup that became active: recorded once, then sent to linked users. */
export const signals = pgTable("signals", {
  id: id(),
  key: text("key").notNull().unique(), // one signal per setup occurrence
  setupId: text("setup_id").notNull(),
  name: text("name").notNull(),
  side: text("side").notNull(),
  entry: doublePrecision("entry").notNull(),
  stop: doublePrecision("stop").notNull(),
  target: doublePrecision("target").notNull(),
  sentTo: integer("sent_to").notNull().default(0),
  createdAt: ts("created_at").notNull(),
}, (t) => [index("signals_created").on(t.createdAt)]);

/**
 * The newest price a robot reported, one row per symbol. Only the owner's (an admin's) robot writes
 * here; every signed-in user reads it, so nobody else has to connect MT5 to see a live chart.
 */
export const liveTicks = pgTable("live_ticks", {
  symbol: text("symbol").primaryKey(),
  bid: doublePrecision("bid").notNull(),
  ask: doublePrecision("ask").notNull(),
  time: ts("time").notNull(),
  source: text("source").notNull(), // the broker server the price came from
});

export type User = typeof users.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type EconomicEvent = typeof economicEvents.$inferSelect;
export type Role = User["role"];

/** What the site's reading said at the moment the robot opened a position: the raw material for "which conditions worked". */
export const botEntries = pgTable("bot_entries", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  login: text("login").notNull().default(""),
  ticket: text("ticket").notNull(), // the position ticket
  side: text("side").notNull(),
  openedAt: ts("opened_at").notNull(),
  openPrice: doublePrecision("open_price").notNull(),
  lots: doublePrecision("lots").notNull(),
  cBuy: integer("c_buy").notNull(),
  cSell: integer("c_sell").notNull(),
  cTotal: integer("c_total").notNull(),
  atrH1: doublePrecision("atr_h1"),
  session: text("session").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.login, t.ticket] })]);

/** One QPay invoice for a plan. PAID once QPay's own check says the full amount came in; that payment extends access once. */
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "PAID", "EXPIRED"]);
export const payments = pgTable("payments", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(), // PLUS | PRO | MAX
  amount: integer("amount").notNull(), // tögrög
  days: integer("days").notNull(),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  senderInvoiceNo: text("sender_invoice_no").notNull(),
  qpayInvoiceId: text("qpay_invoice_id"),
  qrImage: text("qr_image"), // base64 PNG from QPay
  qrText: text("qr_text"),
  shortUrl: text("short_url"),
  urls: jsonb("urls").notNull().default([]), // bank-app links from QPay
  qpayPaymentId: text("qpay_payment_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  checkedAt: ts("checked_at"),
  paidAt: ts("paid_at"),
  accessUntil: ts("access_until"), // the end of access this payment produced
}, (t) => [uniqueIndex("payments_sender_no").on(t.senderInvoiceNo), uniqueIndex("payments_qpay_invoice").on(t.qpayInvoiceId), index("payments_user_created").on(t.userId, t.createdAt)]);
export type Payment = typeof payments.$inferSelect;
