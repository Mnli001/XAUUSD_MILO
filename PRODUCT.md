# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mongolian retail gold (XAUUSD) traders. They open the app before and during their trading session, mostly on a phone and sometimes on a laptop, to see today's signals and direction, which hours tend to move, what news is coming, and to log and review their own trades. Many follow the signals on Telegram and let the MT5 robot (XauBot) place them. An admin (the owner) manages users, payments, news values and the public record.

## Product Purpose

One fixed, tested rule set for gold, delivered three ways: Telegram signals, an MT5 robot each user controls from the web, and the live chart. Around it, an honest read of the day (the leading side, hourly up/down odds, the news calendar with how gold reacted before), a trade journal with analysis, and a demo account on the live price. Success means a trader can decide whether, when and which way to trade in under a minute, and can see whether their own trading is improving. Everything is statistics, never financial advice.

## Positioning

Built in Mongolian, around Ulaanbaatar time and the Asian session, by and for local gold traders: the odds are computed from the trader's own market hours, news reactions come from the last 12 months of the same event, and the signals, robot, journal and alerts live in one place. The proof is shown in the open: the live signal record (winners and losers), the backtest with its losing year, and the ideas that were tested and thrown away.

## Operating Context

- Trading sessions: Asia (Tokyo), London, New York, read in Ulaanbaatar time by default; the viewer may change time zone.
- Data: Twelve Data candles (15m, 1h, 4h, 1d), the 15-minute job at :01, :16, :31, :46 so it reads closed bars; the admin's MT5 feeds the live price every second when it is on; FRED release dates and FOMC values for news.
- The system (docs/SYSTEM_SPEC.md): three session range breakouts (Asia 00:00–07:00 UTC with a 3R target; New York open 12:30–13:30 and New York's second hour 13:30–14:30 UTC with 2R targets and a daily trend score of at least 35). A breakout counts only when the daily and 4-hour trends agree; no entries around high-impact news. The robot's lot is scaled by trend strength (`sizeFactor`: ×1.25 when both trends are ≥ 65, ×0.75 when either is under 35), halved when a same-direction setup position is already open, and capped at 3 open positions.
- Signals: checked after every 15-minute candle; a new setup goes to linked Telegram chats of paying users within about two minutes of the candle closing, with a chart picture, entry, stop, target and the result message when it closes. A morning brief goes out at 08:00 Ulaanbaatar on trading days (users can turn it off).
- Robot: XauBot (MT5 Expert Advisor) syncs with the web every second for config, start/stop and history and trades exactly the Telegram signals. A one-click Windows installer (`XauBot-Setup.bat`) copies the robot into MT5 and fills in a new token; making it cuts off the previous token. Demo accounts by default; real accounts need two switches.
- Access: register for free; a plan (Plus 1 month, Pro 6 months, Max 1 year; same features) opens the signals, the robot and the paid figures. Users pay in tögrög by QPay / a bank app (cards and Toki also work) on Wire's hosted checkout (wire.mn); access opens on Wire's confirmation. The hand-written journal and the demo account are open to every signed-in user.
- Languages: Mongolian (primary) and English are written side by side in the code with `t("мн", "en")`; 18 more languages read translations of the English from `src/locales/*.json` and fall back to English. Dark, light or system theme per user.

## Capabilities and Constraints

- Public pages: landing (live signal record first, then the backtest, the year bars, what was thrown away, plans, FAQ), login, register, password reset, terms, privacy, VPS guide.
- App pages: Today, Signals (Setup), Chart, News, Robot (Bot) and Signal history, Macro, Demo trade, Journal, Performance, Plans, Glossary, Settings, Profile. The markets page was removed.
- Admin: users, payments, revenue, events, bot, public record.
- Journal: closed trades from the MT5 account arrive from the robot (with a plan); any signed-in user can also write trades by hand (date and time, BUY/SELL, entry, exit, lots, optional stop and note; P/L = (exit − entry) × side × lots × 100), edit and delete them. Both kinds share one analysis.
- Bias score per timeframe −100…+100 (trend, momentum, structure); ≥ +20 is "up", ≤ −20 is "down". Hourly odds need ≥ 30 samples; news reactions need ≥ 6. The methods' vote (16 common methods) is a reference only; the signals do not use it.
- Research facts that must stay visible, not hidden: none of 19 rules in the 2026-11-20 study passed the pre-set criteria; London breakout, daytime reversion, H4 swing trades, breakeven and partial exits and other variants were rejected; only what held up in both 2019–2022 and 2023 onward was kept. The backtest (src/data/backtest-curves.json) has a losing year (2023) and differs from the live system (news history only from 2023-11-29, a data gap over the 2020 COVID stretch, no commission or slippage); it is not forward-tested. The live record is short and not yet statistically settled.
- i18n coverage test fails on Mongolian text without an English pair.

## Brand Commitments

Name: XAU Analytics. Voice: plain, factual, Mongolian first, no hype; every forecast is labelled as statistics, not advice. Vocabulary: "Дохио" for signals and setups, "Робот" for the MT5 robot, "Telegram бот" for Telegram; trading terms (setup, breakout, stop, target, R) stay in English with a short Mongolian gloss the first time they appear on the landing page.

## Evidence on Hand

The live signal record (every signal sent, judged on stored candles, public a day late), the owner's public robot account record, the broker-data backtest, and real statistics from stored candles and events. No testimonials, customer counts or invented performance claims; none may be added. A backtest figure is never shown without the line that says what it is.

## Product Principles

1. The day's answer first: signals, direction, timing and risk before detail.
2. Honest numbers: show sample sizes, hide figures that lack data, never imply profit, never promise a result ("while you sleep", "never miss an entry").
3. Phone-first for the trading session, complete on desktop for review.
4. One instrument, one place: analysis, journal, alerts and robot share one language and one look.

## Accessibility & Inclusion

Up/down must never rely on green/red alone (pair with sign, arrow or word). Bilingual text must fit both Mongolian (longer words) and English; no text below 12px; tab labels must not truncate at 375px.
