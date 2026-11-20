# XAU Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-user web system where traders log in and see today's gold (XAUUSD) bias, hourly up/down probabilities, the news calendar with historical reactions, and their own trade journal analytics.

**Architecture:** Next.js App Router monolith. All analysis is pure TypeScript functions in `src/lib/analysis/` (no I/O, fully unit-tested). Cron-triggered route handlers pull candles and calendar events from external providers behind adapter interfaces and store them in PostgreSQL; pages read only from the database, so user count never touches provider rate limits.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, PostgreSQL + Prisma, Auth.js (next-auth v5, Credentials, JWT session) + bcryptjs, TradingView Lightweight Charts, Vitest, Railway.

**Spec:** `docs/superpowers/specs/2026-11-20-trader-analytics-design.md` (copy of the project doc `claude/trader-analytics-design.md`; Task 1 adds it to the repo).

## Global Constraints

- All UI copy is Mongolian (Cyrillic). All times shown in `Asia/Ulaanbaatar` (UTC+8, no DST). All times stored in UTC.
- Only symbol on screen is `XAUUSD`; every table and function takes `symbol` so more can be added.
- Every analysis screen shows the footer text exactly: `Түүхэн статистик дээр суурилсан тооцоо. Санхүүгийн зөвлөгөө биш.`
- Never render the words "худалдаж ав" / "зар" as an instruction. Direction labels are only: `ӨСӨХ хандлага`, `УНАХ хандлага`, `ТОДОРХОЙГҮЙ`.
- Hourly probability with sample size `n < 30` renders `Дата хангалтгүй`, never a percentage.
- Price data on the free plan is delayed: the price header always shows `Сүүлд шинэчлэгдсэн HH:mm` and, when the newest 15m candle is older than 30 minutes, the badge `Хоцролттой`.
- Every query on `Trade` filters by the session `userId`. A trade id that belongs to another user returns 404.
- Do not scrape Forex Factory.
- No automatic payment. Access is `User.accessUntil`, set by an admin.
- Dark trading-dashboard theme.

## Review Focus

1. **Provider down or rate-limited (HTTP 429/5xx):** ingest must not throw away stored data or crash the page; dashboard keeps showing the last stored snapshot with `Хоцролттой`. (Test in Task 5.)
2. **Empty database on first run / weekend with no fresh candles:** dashboard renders `Дата ачаалж байна` blocks, not a 500. (Test in Task 7.)
3. **Trade with no stop-loss or still open:** R-multiple is `null` and is excluded from avg R; open trades are excluded from all stats; no division by zero when there are zero losses. (Test in Task 9.)
4. **US daylight-saving switch:** an 08:30 New York release is 21:30 UB in winter and 20:30 UB in summer. (Test in Task 8.)
5. **User reads or edits another user's trade by guessing the id:** 404, nothing changed. (Test in Task 9.)

---

## File Structure

```
prisma/schema.prisma            data model
prisma/seed.ts                  admin user from env
src/lib/db.ts                   Prisma client singleton
src/lib/time.ts                 UB hour / UB date helpers, session of hour
src/lib/analysis/indicators.ts  ema, rsi, macd, atr, swings
src/lib/analysis/bias.ts        timeframe score, weighted bias, label
src/lib/analysis/levels.ts      pivots
src/lib/analysis/hourly.ts      hourly probability table
src/lib/analysis/reaction.ts    post-event move stats
src/lib/analysis/journal.ts     trade P&L and performance stats
src/lib/data/priceProvider.ts   PriceProvider interface
src/lib/data/twelveData.ts      Twelve Data adapter
src/lib/data/calendarProvider.ts CalendarProvider interface + event-type table
src/lib/data/fredCalendar.ts    FRED release-dates adapter
src/lib/ingest/prices.ts        fetch -> upsert candles -> recompute snapshots
src/lib/ingest/calendar.ts      fetch -> upsert events -> recompute reactions
src/lib/snapshot.ts             getTodaySnapshot(): everything the dashboard needs
src/lib/auth.ts                 Auth.js config, requireUser(), requireAdmin()
src/app/(public)/               landing, login, register, locked
src/app/(app)/today|chart|news|journal|performance|settings/
src/app/admin/                  users, events
src/app/api/cron/prices|calendar/route.ts
src/components/                 Disclaimer, BiasBar, HourlyTable, NewsList, CandleChart, EquityCurve
tests/                          mirrors src/lib
```

Shared type used across tasks (define in `src/lib/analysis/indicators.ts`):

```ts
export type Candle = { time: Date; open: number; high: number; low: number; close: number };
export type Timeframe = "15min" | "1h" | "4h" | "1day";
```

---

### Task 1: Scaffold, schema, test runner

**Files:**
- Create: project via `npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint`
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `src/lib/time.ts`, `vitest.config.ts`, `.env.example`, `docs/superpowers/specs/2026-11-20-trader-analytics-design.md`
- Test: `tests/time.test.ts`

**Interfaces:**
- Produces: Prisma models below; `prisma` export from `src/lib/db.ts`;
  `ubHour(d: Date): number`, `ubDateKey(d: Date): string` (`YYYY-MM-DD`), `sessionOfUbHour(h: number): "Ази" | "Лондон" | "Нью-Йорк" | "Завсар"`.

Prisma models (exact fields):

```prisma
enum Role { USER ADMIN }
enum Direction { BUY SELL }
enum Impact { HIGH MEDIUM LOW }

model User {
  id String @id @default(cuid())
  email String @unique
  name String
  passwordHash String
  role Role @default(USER)
  accessUntil DateTime?
  createdAt DateTime @default(now())
  trades Trade[]
}
model Candle {
  symbol String
  timeframe String
  time DateTime
  open Float
  high Float
  low Float
  close Float
  @@id([symbol, timeframe, time])
}
model BiasSnapshot {
  id String @id @default(cuid())
  symbol String
  computedAt DateTime @default(now())
  total Float
  buyerPct Int
  label String
  perTimeframe Json
  levels Json
  hourly Json
  @@index([symbol, computedAt])
}
model EconomicEvent {
  id String @id @default(cuid())
  type String
  title String
  country String
  impact Impact
  time DateTime
  forecast String?
  previous String?
  actual String?
  source String
  @@unique([type, time])
}
model EventReaction {
  type String @id
  n Int
  stats Json
  updatedAt DateTime @updatedAt
}
model Trade {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol String @default("XAUUSD")
  direction Direction
  lots Float
  entryPrice Float
  exitPrice Float?
  stopLoss Float?
  takeProfit Float?
  openedAt DateTime
  closedAt DateTime?
  note String?
  image Bytes?
  imageMime String?
  @@index([userId, openedAt])
}
```

- [ ] **Step 1: Scaffold** the Next.js app in the repo root, add `prisma @prisma/client vitest bcryptjs next-auth@beta zod lightweight-charts`, copy the spec into `docs/superpowers/specs/`.
- [ ] **Step 2: Write the failing test**

```ts
import { ubHour, ubDateKey, sessionOfUbHour } from "@/lib/time";
test("UB time helpers", () => {
  const d = new Date("2026-11-20T18:30:00Z"); // 02:30 next day in UB
  expect(ubHour(d)).toBe(2);
  expect(ubDateKey(d)).toBe("2026-11-21");
  expect(sessionOfUbHour(9)).toBe("Ази");
  expect(sessionOfUbHour(16)).toBe("Лондон");
  expect(sessionOfUbHour(22)).toBe("Нью-Йорк");
  expect(sessionOfUbHour(3)).toBe("Нью-Йорк");
  expect(sessionOfUbHour(6)).toBe("Завсар");
});
```

Session hours in UB time: Ази 08–14, Лондон 15–20, Нью-Йорк 21–04, Завсар 05–07.

- [ ] **Step 3: Run** `npx vitest run tests/time.test.ts` — expected FAIL (module not found).
- [ ] **Step 4: Implement** `src/lib/time.ts`, `src/lib/db.ts`, the schema; run `npx prisma migrate dev --name init` against a local Postgres.
- [ ] **Step 5: Run** the test — expected PASS. `npm run build` — expected success.
- [ ] **Step 6: Commit** `chore: scaffold app, schema, time helpers`.

---

### Task 2: Indicators

**Files:**
- Create: `src/lib/analysis/indicators.ts`
- Test: `tests/analysis/indicators.test.ts`

**Interfaces:**
- Produces:
  - `ema(values: number[], period: number): number[]` — same length as input, first `period-1` entries `NaN`, seeded with the SMA of the first `period` values.
  - `rsi(closes: number[], period = 14): number[]` — Wilder smoothing, `NaN` until defined.
  - `macdHist(closes: number[]): number[]` — EMA12 − EMA26 minus its EMA9.
  - `atr(candles: Candle[], period = 14): number` — Wilder ATR of the last bar.
  - `swings(candles: Candle[]): { highs: number[]; lows: number[] }` — 3-bar fractals (bar high strictly above both neighbours; same for lows), in time order.

- [ ] **Step 1: Write the failing tests**

```ts
test("ema seeds with SMA", () => {
  const r = ema([1, 2, 3, 4, 5], 3);
  expect(r.slice(0, 2).every(Number.isNaN)).toBe(true);
  expect(r[2]).toBeCloseTo(2);      // SMA(1,2,3)
  expect(r[3]).toBeCloseTo(3);      // 4*0.5 + 2*0.5
  expect(r[4]).toBeCloseTo(4);
});
test("rsi is 100 on only-up series and 0 on only-down", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  expect(rsi(up).at(-1)).toBeCloseTo(100);
  expect(rsi([...up].reverse()).at(-1)).toBeCloseTo(0);
});
test("macdHist is positive in an accelerating uptrend", () => {
  const c = Array.from({ length: 80 }, (_, i) => 100 + i * i * 0.01);
  expect(macdHist(c).at(-1)!).toBeGreaterThan(0);
});
test("atr of constant-range candles equals the range", () => {
  const cs = Array.from({ length: 30 }, (_, i) => ({ time: new Date(i * 36e5), open: 10, high: 12, low: 9, close: 10 }));
  expect(atr(cs)).toBeCloseTo(3);
});
test("swings finds fractal highs and lows", () => {
  const mk = (h: number, l: number, i: number) => ({ time: new Date(i), open: l, high: h, low: l, close: h });
  const cs = [mk(5, 4, 0), mk(7, 5, 1), mk(6, 3, 2), mk(8, 4, 3), mk(7, 5, 4)];
  expect(swings(cs)).toEqual({ highs: [7, 8], lows: [3] });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/analysis/indicators.test.ts` — FAIL.
- [ ] **Step 3: Implement** the five functions.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: technical indicators`.

---

### Task 3: Bias score and levels

**Files:**
- Create: `src/lib/analysis/bias.ts`, `src/lib/analysis/levels.ts`
- Test: `tests/analysis/bias.test.ts`, `tests/analysis/levels.test.ts`

**Interfaces:**
- Consumes: Task 2 functions, `Candle`, `Timeframe`.
- Produces:
  - `timeframeScore(candles: Candle[]): number | null` — −100…+100; `null` when fewer than 210 candles.
  - `WEIGHTS: Record<Timeframe, number>` = `{ "1day": 0.35, "4h": 0.30, "1h": 0.20, "15min": 0.15 }`.
  - `combineBias(scores: Partial<Record<Timeframe, number | null>>): { total: number; buyerPct: number; label: "ӨСӨХ хандлага" | "УНАХ хандлага" | "ТОДОРХОЙГҮЙ" } | null` — weights renormalised over non-null timeframes; `null` when all are null.
  - `pivots(prevDay: Candle): { p: number; r1: number; r2: number; s1: number; s2: number }`.

Scoring rule for `timeframeScore` (the tests do not determine it):

```
trend     : close > EMA50 ? +20 : -20
            close > EMA200 ? +20 : -20
            EMA20[last] > EMA20[last-5] ? +10 : -10
momentum  : clamp((RSI14 - 50) / 20, -1, 1) * 15
            MACD hist > 0 ? +15 : -15
structure : last two swing highs AND last two swing lows both rising  -> +20
            both falling -> -20, otherwise 0
score = trend + momentum + structure        (range -100..+100)
buyerPct = round(50 + total / 2)
label: total >= 20 "ӨСӨХ хандлага"; total <= -20 "УНАХ хандлага"; else "ТОДОРХОЙГҮЙ"
pivots: p=(H+L+C)/3, r1=2p-L, s1=2p-H, r2=p+(H-L), s2=p-(H-L)
```

- [ ] **Step 1: Write the failing tests**

```ts
const trend = (n: number, step: number) =>
  Array.from({ length: n }, (_, i) => {
    const base = 1000 + i * step + Math.sin(i / 3) * Math.abs(step) * 2;
    return { time: new Date(i * 36e5), open: base, high: base + 1, low: base - 1, close: base + step / 2 };
  });
test("steady uptrend scores strongly positive, downtrend negative", () => {
  expect(timeframeScore(trend(300, 1))!).toBeGreaterThan(50);
  expect(timeframeScore(trend(300, -1))!).toBeLessThan(-50);
});
test("too little history returns null", () => {
  expect(timeframeScore(trend(100, 1))).toBeNull();
});
test("combineBias weights and labels", () => {
  const r = combineBias({ "1day": 100, "4h": 100, "1h": -100, "15min": -100 })!;
  expect(r.total).toBeCloseTo(30);      // 35+30-20-15
  expect(r.buyerPct).toBe(65);
  expect(r.label).toBe("ӨСӨХ хандлага");
  expect(combineBias({ "1day": 10, "4h": -10, "1h": 0, "15min": 0 })!.label).toBe("ТОДОРХОЙГҮЙ");
  expect(combineBias({ "1day": null, "4h": null, "1h": null, "15min": null })).toBeNull();
  expect(combineBias({ "1day": null, "4h": null, "1h": -100, "15min": -100 })!.total).toBeCloseTo(-100);
});
test("pivots", () => {
  expect(pivots({ time: new Date(0), open: 0, high: 4120, low: 4080, close: 4100 }))
    .toEqual({ p: 4100, r1: 4120, s1: 4080, r2: 4140, s2: 4060 });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: bias score and pivot levels`.

---

### Task 4: Hourly probability

**Files:**
- Create: `src/lib/analysis/hourly.ts`
- Test: `tests/analysis/hourly.test.ts`

**Interfaces:**
- Consumes: `Candle`, `ema`, `ubHour`, `sessionOfUbHour`.
- Produces:

```ts
export type HourRow = {
  hour: number;               // 0..23, UB time
  session: string;
  n: number; upPct: number | null;          // all days
  nCond: number; upPctCond: number | null;  // same regime as now
  avgMove: number | null;                   // mean |close-open| in USD
};
export const MIN_SAMPLE = 30;
export function hourlyTable(h1: Candle[], now: Date): HourRow[]; // always 24 rows, hour 0..23
```

Rules: use only candles within 183 days before `now`. A candle is "up" when `close > open`. Regime of a candle = `previous candle close > EMA50 at previous candle` (up-regime) or not; the current regime is the regime of the newest candle. `upPct` is `null` when `n < MIN_SAMPLE`; `upPctCond` is `null` when `nCond < MIN_SAMPLE`. Percentages are integers 0–100.

- [ ] **Step 1: Write the failing tests**

```ts
// 120 days of hourly candles; the 15:00 UB candle (07:00 UTC) is up on 3 of every 4 days, all others down.
const cs: Candle[] = [];
for (let d = 0; d < 120; d++) for (let h = 0; h < 24; h++) {
  const time = new Date(Date.UTC(2026, 6, 1 + d, h));
  const up = h === 7 && d % 4 !== 0;
  cs.push({ time, open: 100, high: 102, low: 98, close: up ? 101 : 99 });
}
const now = new Date(Date.UTC(2026, 6, 1 + 120));
test("24 rows, UB hour bucketing, percentage and avg move", () => {
  const t = hourlyTable(cs, now);
  expect(t).toHaveLength(24);
  const row = t.find(r => r.hour === 15)!;
  expect(row.n).toBe(120);
  expect(row.upPct).toBe(75);
  expect(row.avgMove).toBeCloseTo(1);
  expect(row.session).toBe("Лондон");
  expect(t.find(r => r.hour === 10)!.upPct).toBe(0);
});
test("small samples give null, not a percentage", () => {
  const t = hourlyTable(cs.slice(-24 * 20), now);   // 20 days
  expect(t.every(r => r.upPct === null && r.n === 20)).toBe(true);
});
test("candles older than 183 days are ignored", () => {
  const later = new Date(now.getTime() + 150 * 864e5);
  expect(hourlyTable(cs, later).find(r => r.hour === 15)!.n).toBeLessThan(40);
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: hourly probability table`.

---

### Task 5: Price provider, ingest, cron route

**Files:**
- Create: `src/lib/data/priceProvider.ts`, `src/lib/data/twelveData.ts`, `src/lib/ingest/prices.ts`, `src/app/api/cron/prices/route.ts`, `scripts/backfill.ts`
- Test: `tests/data/twelveData.test.ts`, `tests/ingest/prices.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4, Prisma `Candle`, `BiasSnapshot`.
- Produces:

```ts
export interface PriceProvider {
  fetchCandles(symbol: string, tf: Timeframe, opts: { outputsize: number; endDate?: Date }): Promise<Candle[]>; // oldest first
}
export class ProviderError extends Error { constructor(msg: string, public status: number) { super(msg); } }
export async function ingestPrices(provider: PriceProvider, opts: { tfs: Timeframe[]; now: Date }):
  Promise<{ ok: boolean; stored: number; error?: string }>;
export async function recomputeSnapshot(symbol: string, now: Date): Promise<void>; // writes one BiasSnapshot row
```

Decisions:
- Twelve Data endpoint `GET https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=<tf>&outputsize=<n>&timezone=UTC&apikey=$TWELVEDATA_API_KEY`. Internal symbol `XAUUSD` maps to `XAU/USD`. A JSON body with `status: "error"` or a non-200 response throws `ProviderError`.
- `ingestPrices` catches `ProviderError`, returns `{ ok: false, stored: 0, error }`, and leaves existing rows and snapshots untouched. On success it upserts by `(symbol, timeframe, time)` and calls `recomputeSnapshot`.
- Cron route: `POST /api/cron/prices?scope=fast|hourly`, header `Authorization: Bearer $CRON_SECRET`, otherwise 401. `fast` → `["15min"]` (outputsize 20); `hourly` → `["1h","4h","1day"]` (outputsize 20). Budget: 288 + 72 credits/day, under the 800/day free limit.
- `scripts/backfill.ts` (run once): 1day ×400, 4h ×1500, 1h ×5000, 15min ×5000 paged back with `endDate` until 365 days are covered, sleeping 8 s between calls (8 credits/minute limit).
- `BiasSnapshot.hourly` stores `HourRow[]`; `levels` stores `{ ...pivots, atr, prevHigh, prevLow, prevClose }`; `perTimeframe` stores `Record<Timeframe, number | null>`.

- [ ] **Step 1: Write the failing tests**

```ts
// twelveData.test.ts — fetch is stubbed with vi.stubGlobal
test("parses values oldest-first as numbers and UTC dates", async () => {
  stubFetch(200, { status: "ok", values: [
    { datetime: "2026-11-20 10:00:00", open: "4100.1", high: "4105", low: "4098", close: "4103.5" },
    { datetime: "2026-11-20 09:00:00", open: "4095", high: "4101", low: "4094", close: "4100.1" } ] });
  const r = await new TwelveData("k").fetchCandles("XAUUSD", "1h", { outputsize: 2 });
  expect(r[0].time.toISOString()).toBe("2026-11-20T09:00:00.000Z");
  expect(r[1].close).toBe(4103.5);
  expect(lastFetchUrl()).toContain("symbol=XAU%2FUSD");
});
test("429 and error bodies throw ProviderError", async () => {
  stubFetch(429, { code: 429, status: "error", message: "limit" });
  await expect(new TwelveData("k").fetchCandles("XAUUSD", "1h", { outputsize: 2 })).rejects.toBeInstanceOf(ProviderError);
});

// prices.test.ts — runs against the test database
test("provider failure keeps stored candles and reports ok:false", async () => {
  await seedCandles("15min", 50);
  const failing = { fetchCandles: async () => { throw new ProviderError("limit", 429); } };
  const r = await ingestPrices(failing, { tfs: ["15min"], now: new Date() });
  expect(r).toMatchObject({ ok: false, stored: 0 });
  expect(await prisma.candle.count()).toBe(50);
});
test("re-ingesting the same candles does not duplicate", async () => {
  const p = fakeProvider(30);
  await ingestPrices(p, { tfs: ["15min"], now: new Date() });
  await ingestPrices(p, { tfs: ["15min"], now: new Date() });
  expect(await prisma.candle.count({ where: { timeframe: "15min" } })).toBe(30);
});
```

Also a route test: request without the bearer token → 401.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Verify live:** with a real `TWELVEDATA_API_KEY`, run `npx tsx scripts/backfill.ts`; expected log ends with counts ≥ 300 (1day), ≥ 5000 (1h), and one `BiasSnapshot` row exists.
- [ ] **Step 6: Commit** `feat: price ingest and snapshot`.

---

### Task 6: Auth, access gate, admin seed

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/(public)/login/page.tsx`, `src/app/(public)/register/page.tsx`, `src/app/(public)/locked/page.tsx`, `src/app/(app)/layout.tsx`, `src/lib/access.ts`, `prisma/seed.ts`
- Test: `tests/access.test.ts`, `tests/register.test.ts`

**Interfaces:**
- Produces:
  - `hasAccess(user: { role: Role; accessUntil: Date | null }, now: Date): boolean` — true for `ADMIN`, or when `accessUntil > now`.
  - `requireUser(): Promise<{ id: string; role: Role; name: string }>` — redirects to `/login` when signed out, to `/locked` when `hasAccess` is false.
  - `requireAdmin()` — same, plus 404 for non-admins.
  - Server action `registerUser(form): Promise<{ error?: string }>`.

Decisions:
- Register fields: нэр, имэйл, нууц үг (min 8 chars). Email lower-cased and trimmed. Duplicate email → `Энэ имэйл бүртгэлтэй байна`. New users have `accessUntil = null` and land on `/locked`.
- `/locked` copy: `Таны эрх идэвхжээгүй байна. Админтай холбогдож эрхээ нээлгэнэ үү.` plus the user's email and a sign-out button.
- Login failure copy: `Имэйл эсвэл нууц үг буруу байна`.
- `prisma/seed.ts` upserts an `ADMIN` from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- `(app)/layout.tsx` calls `requireUser()` and renders the nav: Өнөөдөр, Чарт, Мэдээ, Журнал, Гүйцэтгэл, Тохиргоо (+ Админ for admins).

- [ ] **Step 1: Write the failing tests**

```ts
test("hasAccess", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  expect(hasAccess({ role: "ADMIN", accessUntil: null }, now)).toBe(true);
  expect(hasAccess({ role: "USER", accessUntil: null }, now)).toBe(false);
  expect(hasAccess({ role: "USER", accessUntil: new Date("2026-11-19T00:00:00Z") }, now)).toBe(false);
  expect(hasAccess({ role: "USER", accessUntil: new Date("2026-12-01T00:00:00Z") }, now)).toBe(true);
});
test("register hashes the password, normalises email, rejects duplicates and short passwords", async () => {
  expect(await registerUser(fd({ name: "A", email: " A@x.mn ", password: "password1" }))).toEqual({});
  const u = await prisma.user.findUniqueOrThrow({ where: { email: "a@x.mn" } });
  expect(u.passwordHash).not.toContain("password1");
  expect(u.accessUntil).toBeNull();
  expect((await registerUser(fd({ name: "B", email: "a@x.mn", password: "password1" }))).error).toBe("Энэ имэйл бүртгэлтэй байна");
  expect((await registerUser(fd({ name: "C", email: "c@x.mn", password: "short" }))).error).toBeTruthy();
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Verify in browser:** register → `/locked`; seeded admin logs in → `/today` (empty page is fine at this point).
- [ ] **Step 6: Commit** `feat: auth and access gate`.

---

### Task 7: Today dashboard and chart

**Files:**
- Create: `src/lib/snapshot.ts`, `src/app/(app)/today/page.tsx`, `src/app/(app)/chart/page.tsx`, `src/components/{Disclaimer,PriceHeader,BiasBar,HourlyTable,LevelsCard,CandleChart}.tsx`, `src/app/api/candles/route.ts`
- Test: `tests/snapshot.test.ts`, `tests/components/HourlyTable.test.tsx`

**Interfaces:**
- Consumes: `BiasSnapshot`, `Candle` rows, `HourRow`, `MIN_SAMPLE`.
- Produces:

```ts
export type TodaySnapshot = {
  price: { last: number; changePct: number; updatedAt: Date; stale: boolean } | null;
  bias: { total: number; buyerPct: number; label: string; perTimeframe: Record<Timeframe, number | null> } | null;
  hourly: HourRow[] | null;
  levels: { p: number; r1: number; r2: number; s1: number; s2: number; atr: number; prevHigh: number; prevLow: number; prevClose: number } | null;
};
export async function getTodaySnapshot(symbol: string, now: Date): Promise<TodaySnapshot>;
```

Decisions:
- `price.last` = close of the newest 15min candle; `changePct` vs previous daily close; `stale` = newest 15min candle older than 30 minutes.
- Any missing part is `null`; the page renders that card with `Дата ачаалж байна` instead of failing.
- `HourlyTable` starts at the current UB hour and shows the next 24 hours; each row shows the conditional percentage when available, else the unconditional one, else `Дата хангалтгүй`; `▲` when ≥ 50, `▼` otherwise; always shows `n`. Rows within 30 minutes of a HIGH-impact event get `⚠ мэдээ` (events prop is an empty array until Task 8).
- `CandleChart` is a client component using Lightweight Charts (follow the installed major version's API), timeframe switch 15м / 1ц / 4ц / Өдөр, EMA20/50/200 lines, horizontal lines for p/r1/s1. Data from `GET /api/candles?tf=&limit=500` (requires session).
- `Disclaimer` renders the Global Constraints footer text and is included in `(app)/layout.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
test("empty database gives an all-null snapshot, not an exception", async () => {
  expect(await getTodaySnapshot("XAUUSD", new Date())).toEqual({ price: null, bias: null, hourly: null, levels: null });
});
test("stale flag after 30 minutes without a new 15min candle", async () => {
  await seedCandles("15min", 10, { lastAt: new Date("2026-11-20T10:00:00Z") });
  expect((await getTodaySnapshot("XAUUSD", new Date("2026-11-20T10:20:00Z"))).price!.stale).toBe(false);
  expect((await getTodaySnapshot("XAUUSD", new Date("2026-11-21T10:00:00Z"))).price!.stale).toBe(true);
});
test("HourlyTable never prints a percentage for small samples", () => {
  render(<HourlyTable rows={[row({ hour: 15, n: 12, upPct: null, nCond: 5, upPctCond: null })]} nowHour={15} events={[]} />);
  expect(screen.getByText("Дата хангалтгүй")).toBeInTheDocument();
  expect(screen.queryByText(/%/)).toBeNull();
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Verify in browser** with backfilled data: `/today` shows price, bias bar with four timeframe arrows, 24 hourly rows, levels, disclaimer; `/chart` switches timeframes.
- [ ] **Step 6: Commit** `feat: today dashboard and chart`.

---

### Task 8: News calendar and event reactions

**Files:**
- Create: `src/lib/data/calendarProvider.ts`, `src/lib/data/fredCalendar.ts`, `src/lib/analysis/reaction.ts`, `src/lib/ingest/calendar.ts`, `src/app/api/cron/calendar/route.ts`, `src/app/(app)/news/page.tsx`, `src/components/{NewsList,Countdown}.tsx`
- Modify: `src/app/(app)/today/page.tsx` (next-event card, pass events to `HourlyTable`)
- Test: `tests/data/fredCalendar.test.ts`, `tests/analysis/reaction.test.ts`

**Interfaces:**
- Produces:

```ts
export type EventType = { type: string; title: string; country: "АНУ"; impact: "HIGH" | "MEDIUM"; nyTime: string; fredReleaseId: number | null };
export const EVENT_TYPES: EventType[];
export interface CalendarProvider { fetchEvents(from: Date, to: Date): Promise<{ type: string; time: Date }[]>; }
export function nyLocalToUtc(dateKey: string, hhmm: string): Date;            // America/New_York wall time -> UTC
export type Reaction = { minutes: 15 | 30 | 60; n: number; avgAbsMove: number | null; upPct: number | null };
export const MIN_EVENTS = 6;
export function eventReaction(eventTimes: Date[], m15: Candle[]): Reaction[];  // always 3 rows
```

Decisions:
- Source: FRED `GET https://api.stlouisfed.org/fred/release/dates?release_id=<id>&include_release_dates_with_no_data=true&file_type=json&api_key=$FRED_API_KEY`. FRED gives dates only; the time comes from `EVENT_TYPES.nyTime`.
- `EVENT_TYPES` rows: `CPI` (Хэрэглээний үнийн индекс, HIGH, 08:30), `NFP` (Ажил эрхлэлтийн тайлан, HIGH, 08:30), `GDP` (ДНБ, HIGH, 08:30), `PCE` (PCE инфляци, HIGH, 08:30), `PPI` (Үйлдвэрлэгчийн үнийн индекс, MEDIUM, 08:30), `RETAIL` (Жижиглэн худалдаа, MEDIUM, 08:30), `FOMC` (ХНС-ийн бодлогын хүү, HIGH, 14:00, `fredReleaseId: null`).
- FOMC and any other event are entered by the admin (Task 10); `source` is `"fred"` or `"admin"`. Forecast / previous / actual are optional admin-entered strings.
- Reaction rule: reference price = open of the 15min candle whose `time` equals the event time; move at N minutes = close of the candle ending at event time + N minus reference. Occurrences with missing candles are skipped. `avgAbsMove` and `upPct` are `null` when `n < MIN_EVENTS`.
- Cron route `POST /api/cron/calendar` (same bearer check): fetch from 365 days back to 60 days ahead, upsert on `(type, time)`, recompute `EventReaction` per type.
- `/news`: this week and next, grouped by UB day; each row `HH:mm · title · impact dot · forecast/previous/actual`, expanding to the three reaction rows as `15 мин: дундаж ±$X, Y% өссөн (n=Z)` or `Түүхэн дата хангалтгүй`. `/today` gets a card with the next HIGH event and a live countdown.

- [ ] **Step 1: Look up the FRED release ids.** Run `curl "https://api.stlouisfed.org/fred/releases?file_type=json&limit=1000&api_key=$FRED_API_KEY"` and record the ids for Consumer Price Index, Employment Situation, Gross Domestic Product, Personal Income and Outlays, Producer Price Index, and Advance Monthly Sales for Retail and Food Services into `EVENT_TYPES`. Expected: six numeric ids, each returning ≥ 12 dates in the last 13 months.
- [ ] **Step 2: Write the failing tests**

```ts
test("New York wall time converts across daylight saving", () => {
  expect(nyLocalToUtc("2026-01-14", "08:30").toISOString()).toBe("2026-01-14T13:30:00.000Z"); // 21:30 UB
  expect(nyLocalToUtc("2026-07-14", "08:30").toISOString()).toBe("2026-07-14T12:30:00.000Z"); // 20:30 UB
});
test("fred adapter maps dates to typed UTC events", async () => {
  stubFetch(200, { release_dates: [{ release_id: 1, date: "2026-01-14" }] });
  const r = await new FredCalendar("k", [{ ...cpi, fredReleaseId: 1 }]).fetchEvents(new Date("2026-01-01"), new Date("2026-02-01"));
  expect(r).toEqual([{ type: "CPI", time: new Date("2026-01-14T13:30:00Z") }]);
});
test("reaction averages absolute moves and counts ups", () => {
  // 8 events; after 15 min: +10 on six of them, -10 on two
  const { times, m15 } = buildEvents([10, 10, 10, 10, 10, 10, -10, -10]);
  const r = eventReaction(times, m15).find(x => x.minutes === 15)!;
  expect(r).toEqual({ minutes: 15, n: 8, avgAbsMove: 10, upPct: 75 });
});
test("fewer than 6 events gives nulls", () => {
  const { times, m15 } = buildEvents([10, 10, -10]);
  expect(eventReaction(times, m15)[0]).toMatchObject({ n: 3, avgAbsMove: null, upPct: null });
});
```

- [ ] **Step 3: Run** — FAIL. **Step 4: Implement.** **Step 5: Run** — PASS.
- [ ] **Step 6: Verify live:** call the cron route; `/news` lists real upcoming releases in UB time.
- [ ] **Step 7: Commit** `feat: news calendar and event reactions`.

---

### Task 9: Trade journal and performance

**Files:**
- Create: `src/lib/analysis/journal.ts`, `src/lib/trades.ts`, `src/app/(app)/journal/page.tsx`, `src/app/(app)/journal/[id]/page.tsx`, `src/app/api/trades/[id]/image/route.ts`, `src/app/(app)/performance/page.tsx`, `src/components/{TradeForm,EquityCurve}.tsx`
- Test: `tests/analysis/journal.test.ts`, `tests/trades.test.ts`

**Interfaces:**
- Produces:

```ts
export const CONTRACT_SIZE = 100;                       // oz per lot, XAUUSD
export type TradeInput = { direction: "BUY" | "SELL"; lots: number; entryPrice: number; exitPrice: number | null;
  stopLoss: number | null; openedAt: Date; closedAt: Date | null };
export function tradePnl(t: TradeInput): number | null;          // null while open
export function tradeR(t: TradeInput): number | null;            // null when open, no SL, or SL == entry
export type Performance = {
  count: number; winRate: number | null; totalPnl: number; profitFactor: number | null; avgR: number | null;
  maxDrawdown: number; equity: { time: Date; value: number }[];
  byHour: Record<number, { count: number; pnl: number }>;        // UB hour of openedAt
  byWeekday: Record<number, { count: number; pnl: number }>;     // 1=Mon..7=Sun, UB
  bySession: Record<string, { count: number; pnl: number }>;
};
export function performance(trades: TradeInput[]): Performance;
// src/lib/trades.ts — every function takes userId first
export async function listTrades(userId: string): Promise<Trade[]>;
export async function getTrade(userId: string, id: string): Promise<Trade | null>;
export async function saveTrade(userId: string, id: string | null, data: unknown): Promise<{ id?: string; error?: string }>;
export async function deleteTrade(userId: string, id: string): Promise<boolean>;
```

Decisions:
- `tradePnl = (exit − entry) × (BUY ? 1 : −1) × lots × 100`. `tradeR = pnl / (|entry − SL| × lots × 100)`.
- Only closed trades count. Win = pnl > 0. `profitFactor` = gross profit / gross loss, `null` when gross loss is 0. `winRate` and `avgR` are `null` with no qualifying trades. `maxDrawdown` = largest peak-to-trough drop of the cumulative P&L curve ordered by `closedAt` (a positive number or 0).
- Validation (zod): lots > 0, prices > 0, `closedAt ≥ openedAt`, `exitPrice` and `closedAt` both present or both absent. Image ≤ 2 MB, PNG/JPEG/WebP only; error `Зураг 2MB-аас бага байх ёстой`.
- `/journal` list columns: огноо, чиглэл (Buy/Sell), лот, орсон, гарсан, P&L ($), R, тэмдэглэл; buttons Нэмэх / Засах / Устгах.
- `/performance` cards: Win rate, Нийт P&L, Profit factor, Дундаж R, Хамгийн их drawdown, Арилжааны тоо; equity curve; three breakdown tables. With zero closed trades show `Хаагдсан арилжаа алга`.

- [ ] **Step 1: Write the failing tests**

```ts
const t = (o: Partial<TradeInput>): TradeInput => ({ direction: "BUY", lots: 0.1, entryPrice: 4100, exitPrice: 4110,
  stopLoss: 4095, openedAt: new Date("2026-11-20T07:00:00Z"), closedAt: new Date("2026-11-20T08:00:00Z"), ...o });
test("pnl and R", () => {
  expect(tradePnl(t({}))).toBeCloseTo(100);                       // 10 * 0.1 * 100
  expect(tradeR(t({}))).toBeCloseTo(2);                           // risk 5 * 0.1 * 100 = 50
  expect(tradePnl(t({ direction: "SELL" }))).toBeCloseTo(-100);
  expect(tradePnl(t({ exitPrice: null, closedAt: null }))).toBeNull();
  expect(tradeR(t({ stopLoss: null }))).toBeNull();
  expect(tradeR(t({ stopLoss: 4100 }))).toBeNull();
});
test("performance stats", () => {
  const p = performance([
    t({ closedAt: new Date("2026-11-20T08:00:00Z") }),                                   // +100
    t({ exitPrice: 4095, closedAt: new Date("2026-11-20T09:00:00Z") }),                  // -50
    t({ exitPrice: 4090, closedAt: new Date("2026-11-20T10:00:00Z"), stopLoss: null }),  // -100
    t({ exitPrice: null, closedAt: null }),                                              // open, ignored
  ]);
  expect(p.count).toBe(3);
  expect(p.winRate).toBeCloseTo(33.33, 1);
  expect(p.totalPnl).toBeCloseTo(-50);
  expect(p.profitFactor).toBeCloseTo(100 / 150);
  expect(p.avgR).toBeCloseTo((2 + -1) / 2);       // the no-SL trade is excluded
  expect(p.maxDrawdown).toBeCloseTo(150);
  expect(p.byHour[15].count).toBe(3);             // 07:00 UTC = 15:00 UB
  expect(p.bySession["Лондон"].pnl).toBeCloseTo(-50);
});
test("no losses and no trades do not divide by zero", () => {
  expect(performance([t({})]).profitFactor).toBeNull();
  expect(performance([])).toMatchObject({ count: 0, winRate: null, avgR: null, maxDrawdown: 0, totalPnl: 0 });
});
// trades.test.ts — test database
test("a user cannot read, edit or delete another user's trade", async () => {
  const { id } = await saveTrade(alice.id, null, validTrade);
  expect(await getTrade(bob.id, id!)).toBeNull();
  expect((await saveTrade(bob.id, id!, { ...validTrade, lots: 9 })).error).toBeTruthy();
  expect(await deleteTrade(bob.id, id!)).toBe(false);
  expect((await getTrade(alice.id, id!))!.lots).toBe(validTrade.lots);
  expect(await listTrades(bob.id)).toHaveLength(0);
});
test("closedAt before openedAt is rejected", async () => {
  expect((await saveTrade(alice.id, null, { ...validTrade, closedAt: "2020-01-01T00:00:00Z" })).error).toBeTruthy();
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (pages return `notFound()` when `getTrade` is null; the image route does the same). **Step 4: Run** — PASS.
- [ ] **Step 5: Verify in browser:** add three trades, see them listed and `/performance` numbers match a hand calculation.
- [ ] **Step 6: Commit** `feat: trade journal and performance`.

---

### Task 10: Admin panel and settings

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/users/page.tsx`, `src/app/admin/events/page.tsx`, `src/lib/admin.ts`, `src/app/(app)/settings/page.tsx`
- Test: `tests/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `EVENT_TYPES`, `nyLocalToUtc`.
- Produces:
  - `grantAccess(adminId: string, userId: string, days: number, now: Date): Promise<Date>` — extends from `max(now, current accessUntil)`.
  - `revokeAccess(adminId: string, userId: string): Promise<void>` — sets `accessUntil = null`.
  - `saveEvent(adminId: string, id: string | null, data: unknown): Promise<{ error?: string }>` — writes `source: "admin"`.
  - `changePassword(userId: string, current: string, next: string): Promise<{ error?: string }>`.
  - All admin functions throw when `adminId` is not an `ADMIN`.

Decisions:
- `/admin/users`: table нэр, имэйл, бүртгүүлсэн, эрх дуусах огноо, төлөв (Идэвхтэй / Идэвхгүй); buttons `+30 хоног`, `+90 хоног`, `Эрх хаах`; search by email.
- `/admin/events`: list of upcoming events; form with төрөл (from `EVENT_TYPES` or free text), гарчиг, огноо + цаг (UB time input, stored UTC), нөлөөлөл, таамаг, өмнөх, бодит; edit and delete.
- `/settings`: change name and password; wrong current password → `Одоогийн нууц үг буруу байна`.

- [ ] **Step 1: Write the failing tests**

```ts
test("grantAccess extends from the later of now and current expiry", async () => {
  const now = new Date("2026-11-20T00:00:00Z");
  expect((await grantAccess(admin.id, u.id, 30, now)).toISOString()).toBe("2026-12-20T00:00:00.000Z");
  expect((await grantAccess(admin.id, u.id, 30, now)).toISOString()).toBe("2027-01-19T00:00:00.000Z");
});
test("revokeAccess clears expiry", async () => {
  await revokeAccess(admin.id, u.id);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).accessUntil).toBeNull();
});
test("non-admins cannot call admin functions", async () => {
  await expect(grantAccess(u.id, u.id, 30, new Date())).rejects.toThrow();
  await expect(saveEvent(u.id, null, validEvent)).rejects.toThrow();
});
test("admin-entered event is stored in UTC with source admin", async () => {
  await saveEvent(admin.id, null, { type: "FOMC", title: "ХНС-ийн бодлогын хүү", ubDate: "2026-12-10", ubTime: "03:00", impact: "HIGH" });
  const e = await prisma.economicEvent.findFirstOrThrow({ where: { type: "FOMC" } });
  expect(e.time.toISOString()).toBe("2026-12-09T19:00:00.000Z");
  expect(e.source).toBe("admin");
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Verify in browser:** admin grants 30 days to a registered user; that user can now open `/today`; after `Эрх хаах` they land on `/locked`.
- [ ] **Step 6: Commit** `feat: admin panel and settings`.

---

### Task 11: Landing page and Railway deploy

**Files:**
- Create: `src/app/(public)/page.tsx`, `README.md`, `railway.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: everything above.

Decisions:
- Landing: headline `Алтны зах зээлийг тоогоор хар`, three feature blocks (Өнөөдрийн чиглэл · Цагийн магадлал · Мэдээний календарь), a static sample of the Today card, buttons `Бүртгүүлэх` / `Нэвтрэх`, and the disclaimer. Signed-in users with access are redirected to `/today`.
- Env vars: `DATABASE_URL`, `AUTH_SECRET`, `TWELVEDATA_API_KEY`, `FRED_API_KEY`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- Railway: one web service (build `npm run build`, start `npx prisma migrate deploy && npm start`), one Postgres, three cron services running `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/<path>`: `prices?scope=fast` every 5 minutes, `prices?scope=hourly` at minute 2 of every hour, `calendar` once a day.
- `README.md` (Mongolian): local setup, env vars, backfill command, seed command, Railway steps, and the two open business items from the spec (paid data plan with display rights before selling; QPay later).

- [ ] **Step 1: Implement** the landing page, `railway.json`, README.
- [ ] **Step 2: Run** `npx vitest run` — all tests PASS; `npm run build` — success; `npm run lint` — no errors.
- [ ] **Step 3: End-to-end check locally** with a fresh database: migrate → seed → backfill → both cron routes → register a user → admin grants access → user sees `/today`, `/chart`, `/news`, adds a trade, sees `/performance`.
- [ ] **Step 4: Commit** `feat: landing page and deploy config`.
