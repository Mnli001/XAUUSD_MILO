# Subscriptions with QPay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users without a plan see the site with the trading numbers hidden as `*****`; buying Plus/Pro/Max through QPay opens everything automatically.

**Architecture:** `hasAccess(user)` stays the single source of truth (admins always, others while `accessUntil` is in the future). Pages decide `paid` on the server and pass placeholders (never the real data) to locked variants of the cards. A `payments` table records each QPay invoice; one service function checks QPay and activates a paid invoice exactly once, used by both the payment page's polling and QPay's callback.

**Tech Stack:** Next.js 16 App Router, Drizzle + Postgres, Auth.js v5, Vitest + Testing Library, QPay merchant API v2.

**Spec:** `docs/superpowers/specs/2026-11-26-subscriptions-qpay-design.md`

## Global Constraints
- Plans: `PLUS` 30 days 50000₮, `PRO` 180 days 150000₮, `MAX` 365 days 300000₮. Names shown as "Plus", "Pro", "Max".
- Every user-facing string is `t("mn", "en")` (the i18n coverage test fails otherwise).
- The mask text is exactly `*****`.
- The QPay callback body is never trusted; only `POST /v2/payment/check` decides.
- A paid invoice extends access once: from `max(now, accessUntil)` by the plan's days.
- QPay settings: `QPAY_BASE_URL`, `QPAY_USERNAME`, `QPAY_PASSWORD`, `QPAY_INVOICE_CODE`. Missing → payments off, plans still shown.
- Our invoice lifetime: 30 minutes.

## Review Focus
1. Two checks of the same paid invoice arriving at once (callback + poll): access must grow by the plan once.
2. A payment that lands after our 30 minutes (callback): access still opens.
3. Partial payment (paid rows below the invoice amount): no access.
4. A user opening someone else's `/pay/<id>` or `/api/payments/<id>`: 404, no QPay call.
5. A locked page's HTML must not contain the real hourly percentages, bias score or levels.

---

### Task 1: Plans and access extension
**Files:** Create `src/lib/plans.ts`; Test `tests/payments/plans.test.ts`
**Produces:** `type PlanId = "PLUS" | "PRO" | "MAX"`; `PLANS: Record<PlanId, { days: number; amount: number; name: string }>`; `isPlanId(v: unknown): v is PlanId`; `extendAccess(current: Date | null, now: Date, days: number): Date`.
- [ ] Tests: the three plans' days and amounts; extend from now when expired or null; extend from the current end when still running.
- [ ] Implement; run; commit.

### Task 2: QPay client
**Files:** Create `src/lib/qpay.ts`; Test `tests/payments/qpay.test.ts`
**Produces:** `type QPayConfig = { baseUrl; username; password; invoiceCode }`; `qpayConfig(env): QPayConfig | null`; `createInvoice(cfg, { senderInvoiceNo, amount, description, callbackUrl }): Promise<{ invoiceId; qrText; qrImage; shortUrl; urls: { name; description; logo; link }[] }>`; `checkInvoice(cfg, invoiceId): Promise<{ paidAmount: number; paymentId: string | null }>`; `cancelInvoice(cfg, invoiceId)`; `clearTokenCache()`.
- [ ] Tests (stubbed fetch): token requested with Basic auth and reused until it nears expiry; `expires_in` given as a unix timestamp (sandbox) or as seconds both work; invoice body carries invoice_code, sender_invoice_no, receiver "terminal", amount, callback_url; check sums PAID rows only; bank links with a `javascript:` scheme are dropped; missing settings → `qpayConfig` null.
- [ ] Implement; run; commit.

### Task 3: Payments table and service
**Files:** Modify `src/lib/db/schema.ts`; generate `drizzle/0010_payments.sql` (drizzle-kit); Create `src/lib/payments.ts`; Modify `tests/helpers/db.ts` (truncate payments); Test `tests/payments/payments.test.ts`
**Consumes:** Task 1, Task 2.
**Produces:** `startPayment(userId, plan, now, cfg, callbackBase): Promise<Payment>`; `refreshPayment(id, now, cfg): Promise<Payment>` (checks QPay, activates once, expires after 30 min with a last check); `paymentFor(id, userId): Promise<Payment | null>`; `listPayments(limit)`; `PAY_TTL_MS = 30 * 60e3`.
- [ ] Tests: start stores PENDING with QR and a unique sender number; refresh on a fully paid invoice marks PAID and extends access by the plan; two refreshes in parallel extend once; partial payment stays PENDING; after 30 minutes unpaid → EXPIRED; a late payment on an EXPIRED invoice still activates; renewing while access runs extends from its end; `paymentFor` with another user's id → null.
- [ ] Implement (activation in one transaction: `UPDATE payments SET status='PAID' WHERE id=? AND status<>'PAID' RETURNING`); run; commit.

### Task 4: Routes and actions
**Files:** Create `src/lib/actions/payments.ts` (`choosePlanAction(form)` → `/pay/<id>`), `src/app/api/payments/[id]/route.ts` (GET, owner only, refreshes, returns `{ status, accessUntil }`), `src/app/api/payments/qpay/callback/route.ts` (GET and POST, `?id=`, refreshes, answers `SUCCESS`); Test `tests/payments/routes.test.ts`
- [ ] Tests: callback with any body only calls payment/check for the stored invoice; unknown id → 200 without a QPay call; status route for another user → 404.
- [ ] Implement; run; commit.

### Task 5: Access model
**Files:** Modify `src/lib/auth.ts` (`requireUser` no longer redirects to /locked; add `requirePaid()` → redirect `/plans`), `src/lib/actions/bot.ts` (requirePaid), `src/app/api/candles/route.ts`, `src/app/api/live/route.ts`, `src/app/api/trades/export/route.ts` (signed in is enough), `src/app/(public)/page.tsx` (any signed-in → /today), `src/app/(public)/locked/page.tsx` (redirect /today), `src/lib/telegram.ts` (no-access text points to plans); move `adminContact` to `src/lib/contact.ts`, delete `LockedCard`; Tests: update `tests/access.test.ts`, replace `tests/components/LockedCard.test.tsx` with `tests/contact.test.ts`
- [ ] Tests first for requirePaid and the open APIs; implement; run; commit.

### Task 6: Locked cards
**Files:** Create `src/components/Paywall.tsx` (`Masked`, `PlansCard`), `src/lib/paywall.ts` (`lockedHourRows(): HourRow[]`); Modify `HourlyTable` (`locked`), `TodayCards` (`BiasBarLocked`, `LevelsCardLocked`), `ReasoningPanel` (`locked`: no polling, `*****`); Tests `tests/components/Paywall.test.tsx`, extend `HourlyTable.test.tsx`
- [ ] Tests: locked hourly shows every hour and `*****`, no `%`; BiasBarLocked/LevelsCardLocked render `*****` and take no data; locked ReasoningPanel never fetches; PlansCard lists Plus/Pro/Max with prices and posts the plan id.
- [ ] Implement; run; commit.

### Task 7: Pages
**Files:** Modify Today, Setup, Bot, Chart, Settings pages, `(app)/layout.tsx` (LiveAlerts only when paid), `AppNav` (Багц link); Create `src/app/(app)/plans/page.tsx`, `src/app/(app)/pay/[id]/page.tsx` + `src/components/PayStatus.tsx`, `src/app/admin/payments/page.tsx` + admin nav link.
- [ ] Implement; full suite; commit.

### Task 8: Verify and deploy
- [ ] Full suite, tsc, eslint, next build.
- [ ] Local screenshots at 390/834/1440: unpaid Today/Setup/Bot (masked, HTML free of real numbers), paid Today, /plans, /pay/<id> (fake QR row), /admin/payments.
- [ ] Push to main; confirm the live landing.
