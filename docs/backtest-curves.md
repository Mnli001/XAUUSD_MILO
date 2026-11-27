# Backtest equity curves (live system)

Data for the site's equity-curve view: `src/data/backtest-curves.json`, written by
`npx tsx --env-file=.env scripts/export-equity-curves.ts` (generated 2026-11-27). The script reads the stored
HIGH-impact releases from the database (`economic_events`), so it needs `.env`.

An outside review found that the earlier model did not match how the live robot trades. This version models the robot's
order handling as closely as the data allows, and lists below what it still leaves out. The earlier model is rerun next
to it in the same script, which gives the before/after table.

## What is modelled

The signals (unchanged):

- The 3 session breakouts in `src/lib/setup/sessionRules.ts`:
  - Asian 00–07 UTC range, rr 3, flat at 20:00
  - NY open 12:30–13:30, rr 2, flat at 20:00, needs |D1| ≥ 35
  - NY late 13:30–14:30, rr 2, held to 07:00 next day (Fridays 20:00), needs |D1| ≥ 35
  - All three: stop at the middle of the range, at least 0.25 × daily ATR. The first breakout that agrees with the trend decides the day.
- Entry at the next bar's open plus the spread ($0.30). Inside a bar the stop is checked before the target. A gap through the stop fills at the open. Time exits fill at the open of the exit bar.

New in this version: the robot's order handling (`mt5/XauBot.mq5`: `TakeOrder`, `SizeTrade`, `ApplyMul`, `EntryBlockedWhy`):

- **News filter (the live "skip" rule, `src/lib/setup/setups.ts`).** A breakout that closes within 30 minutes before or 60 minutes after a stored HIGH-impact release ends the day for that range. No later entry is taken.
  - Releases are stored only from **2023-11-29**, so before that date there is no news data. Those trades are **kept** and counted as unfiltered: 298 of the 534 trades.
  - From 2023-11-29 the filter skipped 7 of 243 signals.
- **At most 3 open positions.** A 4th signal is skipped. In practice this **never binds** with these rules (0 skips): each rule trades at most once a day, and the overnight NY-late trade closes at 07:00, before the next Asian entry (07:15 at the earliest). The cap is modelled anyway, so a future rule change would show up.
- **Lot sizing as the robot does it.** 0.01 lot = $1 per $1 move.
  - Lots are computed for the base risk (a % of the closed balance) and rounded **down** to 0.01.
  - They are then multiplied by `sizeFactor` (×1.25 / ×1 / ×0.75), and by ×0.5 when a same-direction session position is already open, then rounded down again. If that comes to 0, the unmultiplied lots are kept.
- **Small-account rule.** If 0.01 lot would risk more than **1.2×** the intended (multiplied) risk, the trade is skipped. How often this happened (`$1,500` start):

  | Base risk | Signals skipped by the min-lot rule |
  |---|---|
  | 0.5% | 330 of 534 (61.8%) |
  | 1% | 84 (15.7%) |
  | 1.5% | 16 (3.0%) |
  | 2% | 4 (0.7%) |
  | 3% | 1 (0.2%) |

  It rarely binds at 1.5% and above. At 0.5–1% it binds often: a $1,500 account at 0.5% intends to risk $7.50, or $3.75 on a half-size trade, while a 0.01 lot with a $10 stop risks $10.
  - Note: `mt5/XauBot.mq5` currently defines `SMALL_ACCOUNT_X 2.5`, not 1.2. This export uses **1.2** as specified for the new robot rule. With 2.5 (and the same rounding), the results are: 0.5% +76.4% · 1% +148.3% · 1.5% +216.9% · 2% +398.8% · 3% +1365.5%, with 102 / 9 / 3 / 0 / 0 skips.
- **Swap.** $0.25 per oz per night is charged for each broker rollover a position is open through. The rollover is at server midnight: 21:00 UTC during EU summer time, otherwise 22:00 UTC. Wednesday's rollover counts ×3.
  - Only NY-late trades are held past a rollover, because the other rules are flat at 20:00. 94 trades were held, for 132 nights, costing 3.11 R in total.
  - The same charge is applied to longs and shorts. Real swaps differ by side and change over time.
- **The 2019-12-16 → 2020-03-29 data hole.** The broker's M15 history has no bars there, so no trades are possible and the curve is **flat** for those months. It is a gap in the data, not a quiet period for the strategy. Trades that would cross the hole are dropped.

## Method (copied from `scripts/exposure-cap-research.ts` / `scripts/xau-alpha-research.ts`)

- JustMarkets broker candles (M15 / H4 / D1, exported by `mt5/tester/XauExport.mq5`, shifted to UTC by `scripts/broker-data.ts`).
- Daily and 4-hour trend scores (`scoreSeries`) and the daily ATR are aligned to bars that have **closed** (no lookahead).
- The account starts at $1,500 with compounding risk, a % of the closed balance at entry. Positions can overlap, up to the cap.
- Max DD is measured on the **closed-trade balance**, not mark-to-market, so the intratrade DD is higher.
- `monthly` holds the closed balance at each month end. Best and worst month are month-on-month changes in that balance.
- `stats` and `years` are in R, after the news filter and the cap and net of swap. They do not depend on the risk level, so they do not include the min-lot skips, which differ by risk. The curves in `risks` include them.

## Data coverage (read before quoting CAGR)

- The file spans 2019-01-01 → 2026-11-24, but real M15 coverage starts on **2019-09-30**:
  - Jan–May 2019 has about 5 bars a week.
  - Jun–Sep 2019 has about 115 bars a week.
  - So 2019 has only 5 trades, and it shows −1 R only because of that.
- There is the M15 hole described above, **2019-12-16 → 2020-03-29**.
- CAGR uses the **358 covered weeks (6.86 years)**, the weeks with at least 300 M15 bars. It does not use the 7.90 calendar years. `perWeek` uses the same weeks.

## Before / after (spread $0.30, $1,500 start)

Old model = fractional position sizes, no position cap, no news filter, no swap (the previous version of this file). New model = everything above. This is what the JSON now holds.

| Base risk | Old final | Old return | Old CAGR | Old max DD | **New final** | **New return** | **New CAGR** | **New max DD** | New worst / best month |
|---|---|---|---|---|---|---|---|---|---|
| 0.5% | $2,497 | +66.5% | 7.71% | 3.82% | **$1,885** | **+25.7%** | **3.39%** | **2.39%** | −1.28% / +1.96% |
| 1% | $4,069 | +171.3% | 15.66% | 7.52% | **$2,999** | **+100.0%** | **10.63%** | **4.88%** | −2.38% / +6.94% |
| 1.5% | $6,494 | +333.0% | 23.81% | 11.09% | **$4,793** | **+219.5%** | **18.45%** | **10.30%** | −4.54% / +13.67% |
| 2% | $10,157 | +577.1% | 32.15% | 14.65% | **$7,703** | **+413.5%** | **26.93%** | **13.93%** | −6.31% / +16.31% |
| 3% | $23,403 | +1460.2% | 49.25% | 21.79% | **$21,980** | **+1365.3%** | **47.89%** | **20.39%** | −10.28% / +31.81% |

Old worst / best months: 0.5% −1.90% / +5.25% · 1% −3.77% / +10.72% · 1.5% −5.61% / +16.41% · 2% −7.44% / +22.34% · 3% −11.01% / +34.92%.

Trades in R: old 541 trades, 50.65% win rate, +0.198 R on average, profit factor 1.50. New 534 trades, 50.94% win rate, +0.202 R on average net of swap, profit factor 1.51.
New by year: 2019 −1.00 R (5 trades) · 2020 +5.04 · 2021 +10.51 · 2022 +19.70 · **2023 −1.25** · 2024 +15.68 · 2025 +34.45 · 2026 (to Nov) +24.66.

### Where the difference comes from (1.5% risk, cap + news + swap in all)

| Variant | Return | Max DD |
|---|---|---|
| Fractional sizes, no min-lot rule | +344.1% | 11.46% |
| 0.01-lot rounding, no skip rule (under the minimum → 0.01) | +198.0% | 11.03% |
| Fractional sizes + 1.2× skip | +349.7% | 11.46% |
| **Rounding + 1.2× skip (the model in the JSON)** | **+219.5%** | **10.30%** |

- The news filter and the swap almost cancel out: fractional sizes with both give +344.1%, against +333.0% for the old model.
- Most of the drop comes from **rounding lots down to 0.01** on a small account. A 0.019-lot trade becomes 0.01, and multipliers often round away. The effect shrinks as the balance grows.
- The 1.2× rule mostly stops min-lot trades that would over-risk. Without it, rounding alone at 0.5% gives a 16.5% closed DD.

### Spread $0.50 variant (docs only, not in the JSON)

534 trades, +0.186 R on average, 99.25 R in total, 2023 −2.35 R.

| Base risk | Final | Return | CAGR | Max DD | Min-lot skips |
|---|---|---|---|---|---|
| 0.5% | $1,875 | +25.0% | 3.30% | 2.26% | 342 |
| 1% | $2,789 | +85.9% | 9.46% | 6.61% | 99 |
| 1.5% | $4,383 | +192.2% | 16.92% | 11.41% | 23 |
| 2% | $6,094 | +306.2% | 22.67% | 14.58% | 4 |
| 3% | $16,832 | +1022.1% | 42.25% | 23.88% | 1 |

## Caveats (read before quoting any figure)

This is a **backtest**, not live results.

- **In-sample vs out-of-sample.** The rules and their settings were chosen on the broker's 2019–2022 history and checked on 2023 onward, so 2019–2022 (+34.25 R) is in-sample.
  - The first out-of-sample year, **2023, lost 1.25 R** (`outOfSample.year2023R`).
  - **69% of all R comes from 2024–2026** (+74.79 of 107.79 R), during a strong gold trend. Most of the curve's gain is from those three years.
- The news filter covers only 2023-11-29 onward. Before that, trades that the live system would have skipped around news are still in the curve.
- Not modelled (`model.excluded`): commission, slippage beyond the next-bar open, and spread widening at news.
- Also not modelled:
  - the robot's other gates: maximum spread, signal age, the price having already run past the entry, margin, broker stops level;
  - swap differences between longs and shorts and across years;
  - requotes and partial fills.
- Drawdown is measured on closed trades only. The open-equity drawdown is deeper.
- Past results do not predict future returns.
