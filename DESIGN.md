# Design system: Noir & bullion

The source of truth is `src/app/globals.css`. This file is the short map.

## World
A warm black ground lit from above by a faint gold glow, panels like smoked glass, ivory text, and one metal: gold. Gold marks the brand, primary actions and anything that asks for attention.

## Colour (Tailwind names are re-tuned in globals.css)
- `zinc-950` ground #0b0a09, `zinc-900` panel, `zinc-50/100` ivory text, `zinc-400` secondary, `zinc-500` tertiary.
- `amber-300/400/500` gold (#ecd08a / #d9b566 / #b8903f). `--accent-bg` is the gold button gradient.
- `emerald-400` up (#6fcfa3), `red-400` down (#ea8370). Always paired with the `Dir` arrow or a word.
- Sessions: `--color-asia` amethyst, `--color-london` sapphire, `--color-ny` gold.
- Light theme: ivory paper, white panels, gold deepened to ink. Same tokens.

## Type
- Display: Prata (one weight, never bold) for headlines, the price and other large figures: `.font-display`, `.page-title`, `.stamp`.
- UI: Geologica Variable, weight 350 body, tabular lining numerals.

## Components
`.card`, `.table-card` (glass panel, 20px radius), `.hallmark` (gold-edged feature panel), `.btn` (gold pill), `.btn-ghost`, `.input`, `.label`, `.th`/`.td`, `.chip`, `.gold-text`.
Shared pieces: `SessionLine`, `PriceSpark`, `GoldField` (WebGL poured-gold hero), `BrandMark`, `Timetable.tsx` (`Dir`, `SidePill`, `Pnl`, `Station`, `Figures`).

## Motion
`.reveal` (staggered rise on page load), `.draw-line`, `.strike`, `.sheen` (slow highlight on gold), `.now-pulse`. All disabled under `prefers-reduced-motion`.

## Sound
`src/lib/sound.ts`: synthesised chimes (signal, news, trade), toggled in Settings, stored per browser.

## Rules
- Up/down never by colour alone.
- No gold on body text; gold is for marks, actions and attention.
- Numbers shown only with enough data; samples are labelled.
