# Backtest equity curves (live system)

Data for the site's equity-curve view: `src/data/backtest-curves.json`, written by
`npx tsx --env-file=.env scripts/export-equity-curves.ts` (generated 2026-11-27).

## What is modelled

The system as deployed now:

- The 3 session breakouts in `src/lib/setup/sessionRules.ts`:
  - Asian 00–07 UTC range, rr 3, flat at 20:00
  - NY open 12:30–13:30, rr 2, flat at 20:00, needs |D1| ≥ 35
  - NY late 13:30–14:30, rr 2, held to 07:00 next day (Fridays 20:00), needs |D1| ≥ 35
  - All three: stop at the middle of the range, at least 0.25 × daily ATR. The first breakout that agrees with the trend decides the day.
- Conviction sizing `sizeFactor`: ×1.25 when |D1| ≥ 65 and |4H| ≥ 65, ×0.75 when either is below 35, otherwise ×1.
- Half size when a session position in the same direction is already open (`SAME_DIR_MUL` in `mt5/XauBot.mq5`). This is variant c1 in `scripts/exposure-cap-research.ts`.

## Method (copied from `scripts/exposure-cap-research.ts` / `scripts/xau-alpha-research.ts`)

- JustMarkets broker candles (M15 / H4 / D1, exported by `mt5/tester/XauExport.mq5`, shifted to UTC by `scripts/broker-data.ts`).
- Daily and 4-hour trend scores (`scoreSeries`) and the daily ATR are aligned to bars that have **closed** (no lookahead).
- Entry at the next bar's open plus a $0.30 spread. Inside a bar the stop is checked before the target. A gap through the stop fills at the open. Time exits fill at the open of the exit bar.
- Trades that cross a gap of more than 4 days in the M15 data are dropped.
- The account starts at $1,500 with compounding risk, a % of the closed balance at entry. Positions can overlap.
- Max DD is measured on the **closed-trade balance**, not mark-to-market, so the intratrade DD is higher.
- `monthly` holds the closed balance at each month end. Best and worst month are month-on-month changes in that balance.
- Reproduction check: at 1% base risk the run gives +171.3% with a closed DD of 7.52%, the same as c1 in the exposure-cap research (≈ +171%, DD ≈ 7.5%).

## Data coverage (read before quoting CAGR)

- The file spans 2019-01-01 → 2026-11-24, but real M15 coverage starts on **2019-09-30**:
  - Jan–May 2019 has about 5 bars a week.
  - Jun–Sep 2019 has about 115 bars a week.
  - So 2019 has only 5 trades, and it is the "worst year" (−1 R) only because of that.
- There is an M15 hole from **2019-12-16 → 2020-03-29**: no trades, and the balance is flat.
- CAGR uses the **358 covered weeks (6.86 years)**, the weeks with at least 300 M15 bars. It does not use the 7.90 calendar years. `perWeek` uses the same weeks.

## Results (spread $0.30, $1,500 start)

All 541 trades: 1.51 a week, 50.65% win rate, +0.198 R on average, profit factor 1.50.
By year: 2020 +5.54 R · 2021 +10.92 · 2022 +20.40 · 2023 −0.72 · 2024 +15.15 · 2025 +33.11 · 2026 (to Nov) +23.63.

| Base risk | Final balance | Total return | CAGR (6.86 yr) | Max DD (closed) | Worst month | Best month |
|---|---|---|---|---|---|---|
| 0.5% | $2,497 | +66.5% | 7.71% | 3.82% | −1.90% | +5.25% |
| 1% | $4,069 | +171.3% | 15.66% | 7.52% | −3.77% | +10.72% |
| 1.5% | $6,494 | +333.0% | 23.81% | 11.09% | −5.61% | +16.41% |
| 2% | $10,157 | +577.1% | 32.15% | 14.65% | −7.44% | +22.34% |
| 3% | $23,403 | +1460.2% | 49.25% | 21.79% | −11.01% | +34.92% |

## Caveat

This is a **backtest**, not live results:

- The rules were picked on the broker's 2019–2022 history, and 2023 onward was used to judge them, so some of this period is in-sample.
- Real fills, slippage, spreads wider than $0.30 around news, swaps, commissions, lot rounding and minimum lot sizes are not modelled.
- Drawdown is measured on closed trades only. The open-equity drawdown is deeper.
- Past results do not predict future returns.
