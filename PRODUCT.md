# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mongolian retail gold (XAUUSD) traders. They open the app before and during their trading session, mostly on a phone and sometimes on a laptop, to see today's direction, which hours tend to move, what news is coming, and to log and review their own trades. An admin (the owner) opens paid access by hand and manages users, news values and the bot.

## Product Purpose

Turn historical gold price statistics into a short, honest read of the day: the dominant side, hourly up/down odds, the news calendar with how gold reacted before, two fixed setups drawn on the live chart, a trade journal with performance analysis, and an MT5 robot each user controls from the web. Success means a trader can decide whether, when and which way to trade in under a minute, and can see whether their own trading is improving. Everything is statistics, never financial advice.

## Positioning

Built in Mongolian, around Ulaanbaatar time and the Asian session, by and for local gold traders: the odds are computed from the trader's own market hours, news reactions come from the last 12 months of the same event, and the journal, setups, Telegram alerts and MT5 robot live in one place.

## Operating Context

- Trading sessions: Asia (Tokyo), London, New York, read in Ulaanbaatar time by default; viewer may change time zone.
- Data: Twelve Data candles (15m, 1h, 4h, 1d) refreshed every 5 minutes; FRED release dates for news; FOMC values entered by the admin.
- Access: register, then the admin unlocks the account (no payment flow yet; QPay planned). Locked users see a locked page.
- Telegram alerts when a setup becomes active; MT5 robot (XauBot) syncs with the web for config, start/stop and history.
- Languages: Mongolian (primary) and English, side by side via `t("мн", "en")`; dark, light or system theme per user.

## Capabilities and Constraints

- Pages: landing, login, register, locked; Today, Chart, News, Setup, Journal (list, new, detail), Performance, Bot, Settings; Admin users, events, bot, backtest, paper trading.
- Bias score per timeframe −100…+100 (trend, momentum, structure); ≥ +20 is "up", ≤ −20 is "down". Hourly odds need ≥ 30 samples; news reactions need ≥ 6.
- Backtest results (2026-11-20): none of 19 rules passed the pre-set criteria; the Asian range breakout is being forward-tested on paper. The scalper is unproven. These facts must stay visible, not hidden.
- i18n coverage test fails on Mongolian text without an English pair.
- Undecided: pricing and payment.

## Brand Commitments

Name: XAU Analytics. Voice: plain, factual, Mongolian first, no hype; every forecast is labelled as statistics, not advice.

## Evidence on Hand

Real computed statistics from stored candles and events once backfilled. No testimonials, customer counts, win rates or performance claims exist; none may be invented.

## Product Principles

1. The day's answer first: direction, timing and risk before detail.
2. Honest numbers: show sample sizes, hide figures that lack data, never imply profit.
3. Phone-first for the trading session, complete on desktop for review.
4. One instrument, one place: analysis, journal, alerts and robot share one language and one look.

## Accessibility & Inclusion

Up/down must never rely on green/red alone (pair with sign, arrow or word). Bilingual text must fit both Mongolian (longer words) and English.
