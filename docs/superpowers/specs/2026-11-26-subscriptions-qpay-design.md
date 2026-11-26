# Subscriptions with QPay — design

Approved by the owner in chat on 2026-11-26.

## Intent
Anyone can register and use the site straight away. The numbers that help someone trade are hidden as `*****`
until they buy a plan. Paying through QPay opens everything at once, with no admin step.

## Plans
| Plan | Length | Price |
|---|---|---|
| Plus | 30 days | 50,000₮ |
| Pro | 180 days | 150,000₮ |
| Max | 365 days | 300,000₮ |

Paying again before access ends extends from the current end date. Admins always have full access.

## What a signed-in user without a plan sees
- Open: price and the 24-hour line, session line, next news and its past reactions, Chart (candles and EMAs,
  without today's levels), News, Journal, Performance, Glossary, Settings.
- `*****`: on Today the leading side and its score/percentages, the multi-strategy read, every hourly up/down
  percentage and average move, the key levels; on Setup each rule's state, side, entry, stop, target, checks
  and its past record, plus the recent signal list; on Bot everything but the page heading (no token, cannot
  connect or start). Telegram setup signals are not sent.
- Masking happens on the server: the hidden numbers are never sent to the browser (pages pass placeholders;
  the APIs that serve them answer 401).

## Payment flow
1. Today (top, for users without a plan) and `/plans` show the three plans. Choosing one creates a QPay
   invoice and opens `/pay/<id>`.
2. `/pay/<id>` shows the amount, the QR and the bank-app buttons QPay returns, and checks every 5 seconds.
3. Access opens when QPay confirms the payment: via the polling check or QPay's callback
   (`/api/payments/qpay/callback`). The callback body is never trusted: it only triggers
   `POST /v2/payment/check` for that invoice. A payment counts when the paid rows add up to the invoice amount.
4. Activation is idempotent: one paid invoice extends access exactly once.
5. Our invoice expires after 30 minutes; before marking it expired the server checks once more, and a
   payment that still arrives later (callback) is honoured.

## Data
New table `payments`: id, user_id, plan, amount, days, status (PENDING | PAID | EXPIRED), qpay_invoice_id,
sender_invoice_no (unique), qr_image, qr_text, short_url, urls (bank links), created_at, expires_at,
checked_at, paid_at, access_until (the end date this payment produced).

## Configuration
`QPAY_BASE_URL` (sandbox `https://merchant-sandbox.qpay.mn` or production `https://merchant.qpay.mn`),
`QPAY_USERNAME`, `QPAY_PASSWORD`, `QPAY_INVOICE_CODE`. Without them the plans still show, with a note that
payment opens soon and the admin contact (`ADMIN_CONTACT`, `ADMIN_CONTACT_URL`). The owner signs the QPay
merchant contract later and enters the real values on Railway himself.

## Replaced
The "waiting for access" page: `/locked` now redirects to `/today`. Admins keep the manual "extend access".

## Admin
`/admin/payments`: every payment with user, plan, amount, status and times.
