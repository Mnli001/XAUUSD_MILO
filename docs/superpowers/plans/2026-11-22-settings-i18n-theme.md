# Settings: English, light mode, time zone, and the rest — working notes

Asked by the user on 2026-11-22: make the whole site English-capable (admin pages and the MT5
robot too), add a light mode, put both in Settings, and fill Settings with everything that
belongs there. His answers: translate everything; Settings gets Telegram notifications,
journal CSV export, time zone and account deletion.

## Decisions

- **Two wordings side by side.** `t("Монгол", "English")` at the place the text is used
  (`src/lib/i18n.ts`). No dictionary files. Mongolian stays the default, so existing tests
  that assert Mongolian text keep passing.
- **Viewer** (`src/lib/viewer.ts`): language + time zone of whoever is looking. `v.t`, `v.time(d)`,
  `v.dateTime(d)`, `v.zone` (УБ / UB / London), `v.ub("15:00")` (a fixed Ulaanbaatar rule hour on
  the viewer's clock). Library functions take `v: Viewer = MN_VIEWER` or `t: T = mnT` last.
- **Where it comes from.** Server: `getPrefs()/getT()/getViewer()` in `src/lib/prefs.server.ts`
  (signed-in user's row, else cookies `xau_locale`, `xau_theme`, `xau_tz`). Client:
  `useT()/useViewer()` from `src/components/PrefsProvider.tsx`. Server components that tests
  render directly (HourlyTable, NewsList, TodayCards, SetupChart, EquityCurve, Disclaimer) take
  a `v` prop with `MN_VIEWER` as default.
- **Stored columns** (migration 0005): `users.locale`, `theme`, `time_zone`, `signals_paused`,
  `signals_muted`. `src/lib/prefsDb.ts` (savePrefs), `src/lib/account.ts` (saveSignalPrefs,
  wantsSignal, deleteAccount — admins cannot delete themselves), `src/lib/export.ts` (tradesCsv).
- **Theme.** `<html data-theme="dark|light|system">`; `globals.css` overrides the colour
  variables for light. The gold button uses `--accent-bg/--accent-fg`. Charts read the variables.
- **Coverage test.** `tests/i18n-coverage.test.ts` walks the AST of `src` and fails on any
  Cyrillic text that is not inside `t(…, …)`, a `{ mn, en }` pair, or a line marked `// i18n-ok`.
- **Prose with inline elements** (BotGuide, parts of BotPanel/TelegramCard): the English is
  written as its own JSX block rather than fragment by fragment.
- **Stored text** (bias label, event titles, session names, signal names): keys stay as stored;
  English comes from a lookup at display time.
- **Telegram**: each linked user gets the signal in their own language and clock
  (`emitSignals` builds one reading per kind of reader).
- **Robot** (last, separate): web sends `lang` in the sync reply; robot v2.40 shows chart text in
  that language. Needs a compile in MetaEditor and an MT5 restart on the user's PC.

## Order

1. Foundation (done, committed) 2. Translation of pages/components/lib (in progress)
3. Settings page 4. Time zone pass (grep `УБ`, `formatUb`) 5. Admin pages 6. Robot 7. Verify
in a browser in both languages and both themes, then push.
