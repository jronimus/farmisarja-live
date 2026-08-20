# Farmisarja Live — handoff

Updated: 2026-08-20

This document is the source of truth for continuing the project in a new Codex conversation. Read it completely before making changes.

## Immediate continuation instructions

1. Run `git status --short` first.
2. **Do not reset, clean, restore, or discard the current working tree.** It contains the latest approved UI, branding, shirt assets, and unfinished fixes.
3. Start the local app with `npm run dev` and inspect both desktop and mobile layouts using `?demo=1` when visual demo data is needed.
4. Continue with the open tasks listed below, beginning with the GW chip pill alignment.
5. Keep all source code, identifiers, and comments in English. Keep visible page content bilingual Finnish/English.

Suggested prompt for a new conversation:

> Lue `HANDOFF.md` kokonaan ja tarkista `git status --short`. Älä resetoi tai poista nykyisiä muutoksia. Käynnistä lokaalipalvelin ja jatka kohdasta “Open tasks”, ensimmäisenä GW-pisteiden alla olevan chip-pillerin pystykohdistus mobiilissa ja desktopissa.

## Product goal

Farmisarja Live is a personal live Fantasy Premier League mini-league dashboard for league **200068**. It displays the league, live gameweek scoring, transfers, chips, captaincy, form, team value, bench points, squad details, and progress in a responsive Finnish/English UI. A Cloudflare Worker proxies and composes official FPL data and runs Telegram notifications.

The dashboard has one nearly hard-coded league and no user authentication.

## Repository and deployment

- Local folder: `C:\Users\jonir\Vetoliiga-LIVE`
  - The folder still has the old legacy name. Do not rename it unless the user explicitly asks.
- Git branch: `main`
- Git remote: `https://github.com/jronimus/farmisarja-live.git`
- GitHub Pages: `https://jronimus.github.io/farmisarja-live/`
- Cloudflare Worker: `https://farmisarja-fpl-api.vetoliiga.workers.dev`
- FPL league ID: `200068`

GitHub Pages deploys from `main` through `.github/workflows/deploy-pages.yml` with:

- `VITE_FPL_LEAGUE_ID=200068`
- `VITE_FPL_API_URL=https://farmisarja-fpl-api.vetoliiga.workers.dev/api`

Do not commit, push, deploy, or publish changes unless the user asks.

## Current worktree warning

The worktree is intentionally very dirty and contains the newest work. At the time of this handoff, the main modified files include:

- `index.html`
- `src/App.tsx`
- `src/demoData.ts`
- `src/i18n.ts`
- `src/services/liveDashboard.ts`
- `src/styles.css`

There are also many staged deletions of older shirt files and untracked replacement/generated shirt directories, branding variants, fonts, contact sheets, and helper scripts. Some obsolete shirt-generation scripts are deleted. These changes belong to the current implementation and must not be removed blindly.

Recent committed milestones include protected screenshot previews, 1280px screenshot fitting, responsive desktop table refinements, light Telegram screenshots, hiding demo data during live loading, and enabling Telegram alerts.

## Architecture and data flow

### Frontend

- React + TypeScript + Vite.
- Main rendering and table logic: `src/App.tsx`.
- Styling and responsive layouts: `src/styles.css`.
- Finnish/English strings: `src/i18n.ts`.
- Demo league and squad data: `src/demoData.ts`.
- Live data composition/client mapping: `src/services/liveDashboard.ts`.
- Official FPL data is requested through the Worker in production.

Useful query parameters:

- `?demo=1` — show full demo data.
- `?screenshot=1` — screenshot-oriented view.

The app deliberately avoids rendering demo rows while real live data is loading, so demo data should not flash briefly when opening the production page.

### Cloudflare Worker

- Worker configuration: `wrangler.jsonc`.
- Worker code is under the project’s Worker source files; inspect `package.json` scripts for the exact entry points.
- It proxies official FPL endpoints for bootstrap, fixtures, league standings, event live data, entries, entry history, transfers, and picks.
- Cron runs every two minutes.
- Browser Rendering binding: `BROWSER`.
- KV binding: `TELEGRAM_STATE`, namespace ID `565ce503e0d041278d22d2d88c0527b8`.
- Allowed frontend origin: `https://jronimus.github.io`.

Required Worker secrets exist externally and must never be written to this file or committed:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `SCREENSHOT_PREVIEW_SECRET`

## Telegram behavior

The Telegram integration uses the same bot account previously used by the older prediction app, but with Farmisarja-specific commands and behavior.

- `/farmisarja` sends a message with a Telegram button labeled **FARMISARJA LIVE** linking to the site.
- `/deadline` reports the time remaining until the next FPL deadline.
- Automatic deadline reminders are enabled for 24 hours and 2 hours before the deadline.
- After the deadline, when picks first become available, the bot sends a screenshot plus the **FARMISARJA LIVE** link button.
- After all fixtures have finished, it sends another live/provisional screenshot after approximately 30 minutes.
- The screenshot is the desktop league table only (`.league-table`), with an approximately 1340×1200 viewport and a light screenshot presentation.
- Protected screenshot preview endpoint: `/admin/table-screenshot` using the bearer preview secret. It supports demo/light parameters such as `demo=1` and `theme=light`.
- Telegram setup helper: `scripts/setup-telegram.ps1`.

Wrangler variables currently include notifications enabled, Telegram chat ID `-1001048034441`, the league ID, public site URL, and allowed origin.

## Current UI and behavior

### General

- Product name is **FARMISARJA** everywhere; old Vetoliiga branding should not return.
- One unified theme is used instead of separate dark/light themes.
- Page background is a dark green-to-blue gradient with faint, randomly positioned and differently sized versions of the Farmisarja ball mark.
- The table is a pale, slightly translucent/glass-like surface with a violet header.
- Table/body typeface is Inter.
- GW and total point numbers use Archivo Black.
- Do not alter the logo artwork/typeface when changing general typography.
- Header content aligns with the table container on desktop.
- Footer contains official FPL data attribution, updated timestamp, and the GitHub repository link with a GitHub icon. On mobile the footer items stack vertically without separators.

### Header and controls

- Header shows the Farmisarja logo, current GW, deadline/live state, and a compact FI/EN selector.
- Clicking anywhere on the FI/EN selector toggles the language. Both choices remain visible and the active choice is highlighted green.
- Language persists in `localStorage` under `farmisarja-language`.
- The deadline display is bright green.
  - More than 24 hours: days and hours, e.g. `1 pv 3 h`.
  - Less than 24 hours: hours, minutes, and seconds.
- Autosubs uses a stable switch without separate on/off text, preventing its position from shifting.
- Mobile has a “Lisätiedot / Details” toggle. Compact mode is designed to fit roughly ten managers on one phone screen; detailed mode reveals the extended data and expandable squad.

### Table and scoring

- Desktop has columns for position, team/manager, captain, transfers, total transfers, chips, value, bench, form, GW points, progress/played, and total points.
- Mobile compact mode shows aligned headers and compact manager rows. Detailed mode expands the supporting metrics.
- Before GW1 or when data is unavailable, value, bench, form, and similar metrics should show neutral dashes/empty states rather than false `£0.0m` highlights, zero awards, or trophy states.
- After a deadline but before picks are available, the league table is intended to be replaced by a suitable waiting message. It returns immediately once picks data becomes available.
- Team and manager names are already available before picks; squad details only become available after the deadline/picks release.
- Autosubs and captain/vice-captain changes must be reflected in live totals.
- Captain and vice badges sit on the shirt’s top-left corner with enough shadow/contrast.
- Long player names may wrap, but the first line, points, and opponent rows must remain vertically aligned with other cards.
- Player order follows the original FPL squad order; it must not be sorted by match status.
- Player status is communicated through point colors and a legend.
- Chips have distinct colors in all views:
  - TC: purple
  - BB: teal
  - WC: blue
  - FH: orange
- The active chip is also displayed as a small pill below the GW score.
- Best GW score is indicated with a trophy icon positioned without shifting the aligned score number.
- Transfer rows show outgoing/incoming GW points, an equals sign, net result, hits, and the next-GW free-transfer count.
- Special achievement labels have tiered Finnish/English wording and are intentionally stress-tested through demo data.

### Shirt assets

- The project contains custom minimalist flat illustrations for all 20 Premier League home shirts, based on the reference folder `C:\Users\jonir\OneDrive\Desktop\Prem home kits 26-27`.
- They contain no kit manufacturer branding and replace original sponsors with a Farmisarja mark or text adapted to the original sponsor layout.
- White shirt areas must be opaque; transparent white areas previously caused the page background to show through.
- Demo squads are distributed so every one of the 20 shirts can be inspected.
- Do not regenerate or replace these shirts unless explicitly requested. The currently approved shirt visuals are important.

## Open tasks

### 1. Fix GW chip pill vertical alignment — do this first

Current user report:

> Mobiilissa ja ehkä vähän desktopissaki ainaki toi gw pisteiden alla oleva chip pillerin teksti on ihan pillerin alalaidassa, reunan päällä mobiilissa, ja desktopilla ehkä vaan liian alhaalla.

The active chip pill below each GW score needs true vertical centering. It is worst on mobile, where the letters touch the bottom border; desktop is slightly too low as well.

Relevant CSS currently uses `.gw-score`, `.gw-score.has-chip`, and `.gw-score.has-chip > b`. Inspect the current rules before editing. Likely solution: give the pill an explicit stable height/min-height, use inline-flex or grid centering, set `align-items: center`, and use `line-height: 1` rather than relying on a small fixed line-height/baseline. Preserve the existing compact visual size and keep all GW scores aligned whether there is a chip, a hit formula, or a special label.

Validate at minimum:

- Mobile compact demo view with TC, BB, WC, and FH examples.
- Mobile detailed demo view.
- Desktop demo view.
- A row with chip + hit formula + long special text.

### 2. Fix misleading sort arrows in the desktop header

Several headers currently show an upward arrow even though only one column can be actively sorted. The header configuration reuses the `position` sort key for headings that are not meant to sort, so they inherit the active arrow.

Change the header model to allow a non-sortable heading (`SortKey | null`, or equivalent). Render plain header text without a button/chevron for non-sortable columns. Only the actively sorted sortable column should show its direction.

### 3. Verify zero/unavailable live-data presentation

Using the real pre-GW1 state, confirm:

- Team value and bench points do not render malformed colored blocks.
- Unavailable values show dashes rather than `£0.0m` awards.
- No best-score trophy or special achievement is assigned to meaningless zero data.
- Deadline text remains readable and uses the correct countdown.
- Mobile compact and detailed layouts remain aligned.

### 4. Final responsive and screenshot regression check

After the fixes above:

- Check phone width around 390px.
- Check desktop at 1280px, 1380px, and a wide monitor.
- Confirm no horizontal scrollbar overlays/selects the last row.
- Confirm the Telegram screenshot selector captures only the full `.league-table`, even if more managers are later added.
- Confirm Finnish and English longest demo labels wrap without colliding with adjacent columns.

## Development commands

Requirements: Node.js 22+.

```powershell
npm install
npm run dev
```

The dev server uses `vite --host 0.0.0.0`, so it is available to a phone on the same network through the computer’s LAN IP and the Vite port shown in the terminal.

Validation:

```powershell
npm test
npm run build
npm run worker:check
```

Worker development/deployment commands are defined in `package.json`, including:

```powershell
npm run worker:dev
npx wrangler deploy
```

Only deploy after explicit user authorization.

## Important files

- `HANDOFF.md` — this continuation document.
- `package.json` — frontend, test, and Worker scripts.
- `src/App.tsx` — main UI, table headers, sorting, responsive markup, badges, achievements, footer.
- `src/styles.css` — full design system, mobile/desktop layout, table and squad cards, chip/GW score alignment, background pattern.
- `src/demoData.ts` — ten-manager stress-test data and all special-label/shirt examples.
- `src/i18n.ts` — Finnish/English UI and special achievement wording.
- `src/services/liveDashboard.ts` — official FPL response mapping and dashboard calculations.
- `wrangler.jsonc` — Worker bindings, vars, cron, league/site configuration.
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment.
- `scripts/setup-telegram.ps1` — Telegram webhook/command setup.

## Safe working rules

- Preserve current user work and assets.
- Make small, reversible CSS/layout changes and visually compare mobile and desktop after each adjustment.
- Never invent FPL API data or claim a live behavior is verified without testing it.
- Do not expose Telegram or screenshot secrets.
- Do not reintroduce a theme switch, old green/glass experiments, Vetoliiga branding, old shirt assets, or demo-data flashing.
- Do not change the Farmisarja logo font/artwork while standardizing other fonts.
- Do not publish automatically; local changes are the default until the user approves deployment.
