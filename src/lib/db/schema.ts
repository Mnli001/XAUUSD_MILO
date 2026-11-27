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
  telegramPendingUsername: text("telegram_pending_username"), // that chat's @username as Telegram reports it (the display name above is free text)
  sessionVersion: integer("session_version").notNull().default(0), // in every session token; bumped on a password change or reset, which signs out every other session
  signalsPaused: boolean("signals_paused").notNull().default(false), // Telegram stays linked, nothing is sent
  signalsMuted: text("signals_muted").notNull().default(""), // setup ids this user does not want, comma separated
  signalsNews: boolean("signals_news").notNull().default(false), // a Telegram heads-up before HIGH-impact releases (opt-in)
  locale: text("locale").notNull().default("mn"),
  theme: text("theme").notNull().default("dark"),
  timeZone: text("time_zone").notNull().default("Asia/Ulaanbaatar"),
  referralCode: text("referral_code").unique(), // this user's invite code, made the first time it is shown
  referredBy: text("referred_by"), // the user whose invite this account came through
  referralRewardedAt: ts("referral_rewarded_at"), // when the inviter got their days for this account's first payment
  renewRemindedFor: ts("renew_reminded_for"), // the access end a renewal reminder was already sent for
  consentAt: ts("consent_at"), // when the privacy policy and terms were accepted
  consentVersion: text("consent_version"), // which version (LEGAL_VERSION) was accepted
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** A user's profile picture, kept apart from the user row so loading a user never drags the image along. */
export const userAvatars = pgTable("user_avatars", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  image: bytea("image").notNull(), // a small square (256 px), resized in the browser before upload
  mime: text("mime").notNull(), // image/webp | image/jpeg | image/png
  updatedAt: ts("updated_at").notNull().defaultNow(),
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
  actualPeriod: text("actual_period"), // the FRED observation date `actual` was read from, so the same month is never used twice
  move15: doublePrecision("move15"), // gold's move ($) 15 and 60 minutes after the release
  move60: doublePrecision("move60"),
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
  resultSentAt: ts("result_sent_at"), // when the TP / SL / time-exit message went out (null: not yet)
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

/** One Wire payment for a plan. PAID once Wire's own record says the intent succeeded for the full amount; that payment extends access once. */
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "PAID", "EXPIRED", "REFUNDED"]);
export const payments = pgTable("payments", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }), // null once the payer deleted their account: the record of money stays
  plan: text("plan").notNull(), // PLUS | PRO | MAX
  amount: integer("amount").notNull(), // tögrög
  days: integer("days").notNull(),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  senderInvoiceNo: text("sender_invoice_no").notNull(), // our order number, shown to the payer and the admin
  providerRef: text("provider_ref"), // Wire PaymentIntent id (pi_…)
  checkoutUrl: text("checkout_url"), // Wire hosted checkout (https://pay.wire.mn/c/…)
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  checkedAt: ts("checked_at"),
  paidAt: ts("paid_at"),
  accessUntil: ts("access_until"), // the end of access this payment produced
  refundedAt: ts("refunded_at"), // Wire reported the money returned (refund or chargeback)
  adminNote: text("admin_note"), // something the admin must look at, e.g. what a refund did to access
}, (t) => [uniqueIndex("payments_sender_no").on(t.senderInvoiceNo), uniqueIndex("payments_provider_ref").on(t.providerRef), index("payments_user_created").on(t.userId, t.createdAt)]);
export type Payment = typeof payments.$inferSelect;
export type Signal = typeof signals.$inferSelect;

/** Small facts the background jobs must remember across restarts: a weekly report sent, a price-feed alert raised. */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

/** Attempts counted per key (an IP, an email, a Telegram chat) in fixed windows, so the counts hold across server instances. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: ts("window_start").notNull(),
});

/** One-time password reset links (sent by the Telegram bot). Only the SHA-256 of the token is stored. */
export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/**
 * A browser or installed app that agreed to receive push notifications. One user can have several (phone, laptop).
 * A subscription the push service reports gone (404/410) is deleted on the next send.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("push_subscriptions_user").on(t.userId)]);
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/**
 * "Tell me when gold reaches this price". `direction` is fixed when it is set: "above" when the level was above the
 * price at that moment (it fires once price reaches it from below), "below" otherwise. It fires once, then stays as history.
 */
export const priceAlerts = pgTable("price_alerts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull().default("XAUUSD"), // gold, or one of lib/marketList's instruments
  level: doublePrecision("level").notNull(),
  direction: text("direction").notNull(), // "above" | "below"
  createdAt: ts("created_at").notNull().defaultNow(),
  triggeredAt: ts("triggered_at"),
  triggeredPrice: doublePrecision("triggered_price"),
}, (t) => [index("price_alerts_open").on(t.triggeredAt, t.direction, t.level), index("price_alerts_user").on(t.userId, t.createdAt)]);
export type PriceAlert = typeof priceAlerts.$inferSelect;

/**
 * "Tell me when …" on a chart condition rather than a price: RSI crossing a level, EMA 50/200 crossing, yesterday's
 * high or low broken or swept. Checked on each closed bar of its timeframe; it fires each time the condition newly
 * happens (at most once per bar) until it is deleted.
 */
export const conditionAlerts = pgTable("condition_alerts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull().default("XAUUSD"),
  kind: text("kind").notNull(),
  timeframe: text("timeframe").notNull(), // "15min" | "1h" | "4h"
  value: doublePrecision("value"), // the RSI level, for the RSI kinds
  createdAt: ts("created_at").notNull().defaultNow(),
  lastBarAt: ts("last_bar_at"), // the bar it last fired on, so no bar fires twice
  lastFiredAt: ts("last_fired_at"),
}, (t) => [index("condition_alerts_user").on(t.userId)]);
export type ConditionAlert = typeof conditionAlerts.$inferSelect;

/**
 * A member's own limits for one MT5 account, the way prop firms set them: a daily loss limit and an overall loss
 * limit as % of the account size, and an optional profit target. Checked on every robot report against equity.
 */
export const riskRules = pgTable("risk_rules", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  login: text("login").notNull(),
  accountSize: doublePrecision("account_size").notNull(),
  dailyLossPct: doublePrecision("daily_loss_pct").notNull(),
  maxLossPct: doublePrecision("max_loss_pct").notNull(),
  profitTargetPct: doublePrecision("profit_target_pct"),
  closeOnBreach: boolean("close_on_breach").notNull().default(true),
  dayKey: text("day_key").notNull().default(""), // the UTC day dayStartEquity belongs to
  dayStartEquity: doublePrecision("day_start_equity").notNull().default(0),
  warned: text("warned").notNull().default(""), // notices already sent: "<day>:daily", "max", "target"
  breach: text("breach"), // "RISK_MAX", or "RISK_DAILY:<day>"
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.login] })]);

/** Daily or weekly values of the things that move gold: the dollar, real yields, futures positioning. One row per series and date. */
export const macroSeries = pgTable("macro_series", {
  series: text("series").notNull(), // "DTWEXBGS", "DFII10", "DGS10", "COT_NC_NET", "COT_OI"
  date: text("date").notNull(), // YYYY-MM-DD
  value: doublePrecision("value").notNull(),
}, (t) => [primaryKey({ columns: [t.series, t.date] })]);

/**
 * Every closed trade on a member's MT5 account (their own and the robot's), reported by the robot from v3.90, for
 * the automatic journal. One row per closing deal; `magic` 0 is a trade placed by hand.
 */
export const journalTrades = pgTable("journal_trades", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  login: text("login").notNull(),
  ticket: text("ticket").notNull(),
  position: text("position"),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // the position's side: BUY or SELL
  lots: doublePrecision("lots").notNull(),
  openPrice: doublePrecision("open_price").notNull(),
  closePrice: doublePrecision("close_price").notNull(),
  openTime: ts("open_time").notNull(),
  closeTime: ts("close_time").notNull(),
  profit: doublePrecision("profit").notNull(), // with swap and commission
  magic: text("magic").notNull().default("0"),
}, (t) => [primaryKey({ columns: [t.userId, t.login, t.ticket] }), index("journal_user_close").on(t.userId, t.closeTime)]);
export type JournalTrade = typeof journalTrades.$inferSelect;
