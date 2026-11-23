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
  signalsPaused: boolean("signals_paused").notNull().default(false), // Telegram stays linked, nothing is sent
  signalsMuted: text("signals_muted").notNull().default(""), // setup ids this user does not want, comma separated
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

export type User = typeof users.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type EconomicEvent = typeof economicEvents.$inferSelect;
export type Role = User["role"];
