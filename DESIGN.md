---
name: XAU Analytics
description: The gold trading day read as a departure timetable, on Ulaanbaatar time.
colors:
  signal-yellow: "#f2b632"
  signal-yellow-text: "#f7cf6b"
  signal-yellow-deep: "#e0a21c"
  line-asia: "#9b7ff5"
  line-london: "#3d8bec"
  line-ny: "#f2b632"
  line-off: "#4f606c"
  up-green: "#2fca8b"
  up-green-fill: "#1fb57a"
  down-vermilion: "#f46f53"
  down-vermilion-fill: "#ef5a3c"
  platform-night: "#0c1620"
  enamel-panel: "#152330"
  panel-edge: "#233441"
  rule-strong: "#2f404c"
  chart-grid: "#1b2a37"
  muted-text: "#7d8e99"
  secondary-text: "#9aa9b2"
  body-text: "#d5dde0"
  enamel-plate: "#eef2ee"
  enamel-plate-hover: "#ffffff"
  enamel-white: "#f6f8f7"
typography:
  display:
    fontFamily: "Geologica Variable, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  answer:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  price:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum, lnum"
  title:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  card-heading:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "tnum, lnum"
  card-label:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  axis:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    fontFeature: "tnum, lnum"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.enamel-plate}"
    textColor: "{colors.platform-night}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.enamel-plate-hover}"
    textColor: "{colors.platform-night}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.body-text}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.panel-edge}"
  card:
    backgroundColor: "{colors.enamel-panel}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.platform-night}"
    textColor: "{colors.enamel-white}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "44px"
  side-pill-buy:
    textColor: "{colors.up-green}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
    typography: "{typography.label}"
  side-pill-sell:
    textColor: "{colors.down-vermilion}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
    typography: "{typography.label}"
  arrival-strip:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.platform-night}"
    padding: "16px 20px"
  line-badge:
    rounded: "{rounded.full}"
    size: "10px"
  station:
    rounded: "{rounded.full}"
    size: "13px"
---

# Design System: XAU Analytics

## Overview

**Creative North Star: "The Night Platform Timetable"**

The gold trading day is read the way a commuter reads a departures board on a night platform. One true-scale 24-hour axis carries the three trading sessions as coloured lines, each hour is a departure row with its up and down odds, and every scheduled news release is an arrival with a countdown. The ground is a blue-black platform at night; content sits on enamel plates lettered in enamel white. Line colours key the sessions the way a metro map keys its lines, and two signal colours (green up, vermilion down) carry direction, always together with a drawn arrow, a sign or a word.

The system is dense but calm: tabular numerals aligned in columns, fine rules between rows, round-capped line strokes, small round badges and hollow stations. There is one dominant answer per screen (on Today, the day's side, set larger than anything else), and the rest is supporting timetable. The world refuses the category default of a black-and-gold card dashboard with a gauge; yellow here is a signal paint, not a luxury metal.

A light theme is the daytime platform: pale blue-grey enamel ground, white plates, and the same lines and signals deepened until they read as text on a light ground. The ramp is inverted rather than redesigned, so every component works in both.

**Key Characteristics:**
- One true-scale 24-hour line diagram is the signature, reused as page header, hour axis and session key.
- Session line colours (violet Asia, blue London, yellow New York) and signal colours (green up, vermilion down) are separate vocabularies.
- Geologica for everything; tabular, lining numerals everywhere; numbers right-aligned in columns.
- Flat enamel plates with a fine edge and a low shadow; no gradients, no glass, no glow.
- Round geometry for every line, badge and station; gently rounded rectangles for plates and controls.

## Colors

A night-platform blue-black ramp, three session line colours, one signal yellow, and a green/vermilion direction pair.

### Primary
- **Signal Yellow** (signal-yellow): the attention paint. The "now" marker on the day line, news arrival diamonds and flags, the next-release arrival strip, the current stop on the nav rail and the active tab marker, the focus ring, the caret and selection tint. Its lighter step (signal-yellow-text) is used for yellow text such as "now", "Delayed" and the admin link.

### Secondary
- **Asia Violet** (line-asia), **London Blue** (line-london), **New York Yellow** (line-ny): session line colours. They appear only as line strokes, 5px hour-row bars, small round badges and the session key. Off-hours use **Off-Hours Slate** (line-off). Past time on the day line is the line colour mixed 38% into the panel edge, like departed trains on a board. On charts, the EMA50 line borrows London Blue and the EMA200 line borrows Asia Violet.

### Tertiary
- **Up Green** (up-green, fill up-green-fill) and **Down Vermilion** (down-vermilion, fill down-vermilion-fill): direction only. Text uses the 400 step; bars and split meters use the 500 fill; pills and change badges use the fill at 15% behind the text colour.

### Neutral
- **Platform Night** (platform-night): page ground, nav rail, top and tab bars, input wells.
- **Enamel Panel** (enamel-panel): every card, table plate and figure cell.
- **Panel Edge** (panel-edge): card borders, row rules, the off-hours track, the current-hour row tint (at 45%).
- **Strong Rule** (rule-strong): ghost-button and input borders, hollow nav stations.
- **Chart Grid** (chart-grid): chart gridlines only.
- **Muted Text** (muted-text), **Secondary Text** (secondary-text), **Body Text** (body-text): table headers and sample sizes; card labels and ledes; ordinary copy.
- **Enamel White** (enamel-white): headings, figures, the "now" needle. **Enamel Plate** (enamel-plate) is the primary button face.

In the light theme the same tokens re-point: ground #edf1f3, panel #ffffff, edge #d9e1e5, enamel white becomes ink #0b151d, the primary button becomes a dark plate (#0c1620, hover #1d2d3a), lines deepen to #6a4bd6 / #1f63c0 / #c78c0c, up text to #0d754f, down text to #b8391f, yellow text to #8a6000.

### Named Rules
**The Two Vocabularies Rule.** Session colours say *when*; green and vermilion say *which way*. Never colour a direction with a session colour or a session with a signal colour.

**The Arrow Travels With It Rule.** Green and vermilion never carry meaning alone: every up/down value is paired with a drawn triangle, a sign (+ / −) or a word ("up", "down", BUY, SELL).

**The Enamel Plate Rule.** Primary actions are enamel signs: pale plate, dark lettering in dark mode; dark plate, pale lettering in light mode. Yellow is never a button face inside the app.

## Typography

**Display Font:** Geologica Variable (with system-ui, -apple-system, Segoe UI, Roboto, Noto Sans)
**Body Font:** Geologica Variable
**Label/Mono Font:** Geologica Variable; there is no monospace face. Columns align through tabular, lining numerals set on the body.

**Character:** One geometric-humanist family across every role, with full Cyrillic coverage for Mongolian. Weight and size do the work: extra-bold, tightly tracked display for the answer, plain regular for copy, medium for labels.

### Hierarchy
- **Display** (800, 2.75rem phone to 4.5rem, line-height 1.02, -0.035em): landing headline only, max 16ch.
- **Answer** (800, 3rem phone to 3.75rem, line-height 1, -0.03em): the day's dominant side on Today, in its signal colour with a drawn triangle. The largest type in the app.
- **Headline** (700, 1.875rem to 2.25rem, -0.025em): landing section heads.
- **Price** (700, 26px phone to 34px, -0.02em, tabular): the live XAUUSD figure.
- **Title** (700, 24px phone to 28px, -0.02em): page titles; lede under it is body-size secondary text, max 65ch.
- **Card heading** (600, 15px): headed plates such as the hour table.
- **Body** (400, 14px, line-height 1.6): copy, table cells (hour figures at 15px semibold). Landing lede at 18px.
- **Card label** (500, 13px): the quiet title at the top of a plate, in secondary text, sentence case.
- **Label** (500, 12px): form labels, table headers, figure captions, pills.
- **Axis** (11px): axis hour ticks, the "now" tag, tab-bar labels. The floor; nothing smaller.

### Named Rules
**The Tabular Rule.** Every figure (prices, percentages, counts, times, money) uses tabular lining numerals and right-aligns in its column, so values line up like a timetable.

**The Sentence Case Rule.** Labels and headings are sentence case at their natural size. No uppercase tracked labels above headings.

## Layout

Phone first. Content sits in a 72rem (max-w-6xl) column with 16px gutters on phones, 24px from 640px and 32px from 1024px; vertical page padding 20 to 32px. Plates stack with 16px gaps (20px from 640px). Card padding is 16px, 20px from 640px; tables run edge to edge inside their plate and scroll sideways when they must.

Below 1024px the shell is a slim 56px top bar (brand) and a fixed six-tab bottom bar in thumb reach, both respecting safe-area insets. From 1024px a 240px left rail replaces both. Today becomes two columns, a flexible main column and a 20rem side column (the arrival strip, then key levels, sticky).

Rhythm comes from rules and rows rather than whitespace: table rows are 10px top and bottom, figure boards are grids of cells divided by 1px rules, and the hour table highlights the current hour as a tinted row. The landing page opens up to 64 to 96px between sections.

## Elevation & Depth

Flat enamel with one low shadow. Every plate carries the same panel shadow: an inset 1px highlight and a soft drop below it in dark mode, a tight 1–2px contact shadow plus a soft drop in light mode. Depth otherwise comes from the tonal step between the platform ground and the enamel panel, and from fine 1px edges. Only the account menu, which floats over content, lifts further.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 0 rgb(255 255 255 / 0.03) inset, 0 8px 24px -12px rgb(0 0 0 / 0.6)`; light: `0 1px 2px rgb(12 22 32 / 0.06), 0 8px 24px -16px rgb(12 22 32 / 0.25)`): every card, table plate and outer figure board.
- **Menu** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.4)`): the account popover only.

### Named Rules
**The One Shadow Rule.** Plates share one panel shadow; a component never invents its own elevation to stand out. Emphasis comes from colour (the yellow arrival strip) or size (the answer), not lift.

## Shapes

Two families. Everything that is a line, a badge, a station or a track is fully round: session strokes (7px, 11px on the large diagram) with round caps, 5px session bars on hour rows, 10px line badges, 13px stations with a 3px ring (hollow when off, filled when live), the "now" knob. Plates and controls are gently rounded rectangles: 6px for pills and chips, 8px for buttons, inputs and inset boards, 12px for cards and table plates, 16px for the landing hero panel and closing band. News arrivals are the one angular mark: a small square rotated 45 degrees into a diamond.

Lines run vertically too: the nav rail, the key-levels ladder and the landing question list hang their stations on a 3px round track.

## Components

### Buttons
Enamel signs: solid, plain, confident.
- **Shape:** gently rounded (8px), min height 44px on phones, 40px from 640px.
- **Primary:** enamel plate face with platform-night lettering, 14px semibold, 16px side padding.
- **Hover / Focus:** face brightens to pure white (light theme: lifts to #1d2d3a); press scales to 0.98 over 150ms ease-out; focus is a 2px signal-yellow outline offset 2px.
- **Ghost:** transparent with a strong-rule border and body-text lettering, 14px medium; hover fills panel edge.
- **Disabled:** 45% opacity, not-allowed cursor.

### Chips and pills
- **Side pill:** BUY or SELL in 12px bold, drawn triangle plus word, up-green or down-vermilion on its fill at 15%, 6px radius.
- **Change badge:** the price change, same treatment at 14px.
- **News flag:** fully round, signal yellow at 15% behind yellow text, with a small yellow diamond.
- **Chip:** neutral, panel-edge border, 6px radius, 14px.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** enamel panel on the platform ground.
- **Shadow Strategy:** the Panel shadow (see Elevation).
- **Border:** 1px panel edge.
- **Internal Padding:** 16px, 20px from 640px; tables flush to the edges.
- **Figures board:** a grid of cells separated by 1px rules, each cell a 12px muted label over an 18px semibold tabular figure.

### Inputs / Fields
- **Style:** platform-night well inside the plate, 1px strong-rule border, 8px radius, 16px text on phones (no iOS zoom), 14px from 640px, signal-yellow caret.
- **Focus:** border turns signal yellow.
- **Disabled:** 60% opacity.

### Navigation
- **Rail (from 1024px):** a 3px track runs down the left; each page is a 13px station on it. The current page has a filled yellow station, semibold enamel-white label and an enamel-panel row; others are hollow with secondary text.
- **Bottom tab bar (phones, tablets):** six tabs with 22px outline SVG icons and 11px labels; the current tab gets a 3px yellow bar along its top edge and a heavier stroke.
- **Section links (admin):** a 3px yellow underline marks the current section.

### Session Line (signature)
The day as a line diagram: a full-width 3px off-hours track, the three sessions as round-capped coloured strokes at true length on the viewer's 24-hour clock, past time muted, hour stations every three hours, yellow diamond arrivals for high-impact releases, and an enamel-white needle with a pulsing yellow knob at "now". Ticks at 00/06/12/18/24 and a key below listing each session with its hours (the current one in semibold white). It draws itself left to right once on load (900ms, `cubic-bezier(0.16, 1, 0.3, 1)`); the knob pulses every 2.4s. Both stop under reduced motion. A large variant (11px strokes) heads the landing page.

### Hour Timetable
One row per hour for the next 24 hours, starting at the current hour: a 5px session bar, the hour in 15px semibold, the session name, the odds as triangle + percentage + word in its signal colour, a split up/down meter on wide screens, the sample size (n=), a news flag where a release falls, and the average move right-aligned. The current hour row is tinted and tagged "now" in yellow.

### Arrival Strip
The next high-impact release as a signal-yellow band at the top of its plate, platform-night lettering, the release name in 18px bold and a large tabular countdown, with past reactions listed below on the enamel panel.

## Do's and Don'ts

### Do:
- **Do** put every time-of-day view on the one true-scale 24-hour axis, using the Session Line rather than a new chart.
- **Do** pair every up/down colour with a drawn triangle, a sign or a word.
- **Do** set every figure in tabular lining numerals and right-align numeric columns.
- **Do** show the sample size beside every percentage, and show "Not enough data" instead of a figure when the sample is short.
- **Do** keep one dominant answer per screen, set in the Answer style.
- **Do** keep touch targets at 44px minimum on phones.
- **Do** draw icons and direction marks as inline SVG in currentColor.

### Don't:
- **Don't** build a black-and-gold dashboard: no metallic gold, no gold gradients, no gauges or dials.
- **Don't** use a session line colour for direction, or green and vermilion for a session.
- **Don't** make a yellow button inside the app; primary actions are enamel plates.
- **Don't** add uppercase tracked eyebrow labels above headings.
- **Don't** give a component its own shadow, glow or gradient; plates share the one panel shadow.
- **Don't** set text below 11px.
