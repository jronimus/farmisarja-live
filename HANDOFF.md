# Farmisarja Live — handoff

Updated: 2026-08-23

Source of truth for continuing the project in a new conversation. Read it completely
before making changes.

## Start here

1. Run `git status --short` first. Do not reset, clean or discard the working tree.
2. `npm install`, then `npm run dev` for the dashboard.
3. Validation before any commit: `npm test`, `npm run build`, `npm run worker:check`.
4. Source code, identifiers and comments in English. Visible page content in Finnish
   (the dashboard is bilingual FI/EN; the share cards are Finnish only).
5. Deploy only when asked. Pages deploys on push to `main`; the Worker needs a separate
   `npx wrangler deploy`.

## Product

A live Fantasy Premier League dashboard for the private mini-league **200068**
("Farmisarja"), seven managers. It shows the league table, live scoring, transfers,
chips, captaincy, form, team value, bench points and squads. A Cloudflare Worker
proxies FPL, and drives Telegram notifications and share-card screenshots.

- Local folder: `C:\Users\jonir\Vetoliiga-LIVE` (legacy name, do not rename)
- Repo: `https://github.com/jronimus/farmisarja-live.git`, branch `main`
- Pages: `https://jronimus.github.io/farmisarja-live/`
- Worker: `https://farmisarja-fpl-api.vetoliiga.workers.dev`
- Worker secrets live outside the repo: `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_WEBHOOK_SECRET`, `SCREENSHOT_PREVIEW_SECRET`

## Files

| Path | What it is |
| --- | --- |
| `src/App.tsx` | Dashboard UI, table, sorting, header, award labels |
| `src/styles.css` | Dashboard styles, ~1100 lines, heavily layered overrides |
| `src/ShareCard.tsx` | The three Telegram cards |
| `src/cards.css` | Card styles, everything prefixed `sc-` |
| `src/services/awards.ts` | Award rules, thresholds, rarity, selection |
| `src/services/liveDashboard.ts` | FPL response mapping and dashboard composition |
| `src/services/fplRules.ts` | Chips, free transfers, provisional autosubs |
| `src/i18n.ts` | FI/EN strings |
| `src/demoData.ts` | Ten-manager stress data for `?demo=1` |
| `worker/index.ts` | Proxy routes, webhook, protected screenshot endpoint |
| `worker/telegram.ts` | Reminders, card capture, staged report, bot commands |
| `public/cards/*.webp` | Card backgrounds, 1080×1350 |

## Share cards

Three cards, each rendered by the app itself from live data at its delivered size of
**1080 × 1350**:

- `?card=round` — Kierroksen pisteet, ranked by gameweek points, captain in the meta line
- `?card=total` — Kokonaistilanne, ranked by total points, with rank movement arrows
- `?card=awards` — Kierroksen palkinnot, conditional award tiles

Add `&demo=1` to render any card from demo data, which is the only way to see rank
movement and the transfer, chip and history awards before they can occur.

### Geometry, all measured rather than guessed

- The artwork carries its own row bands of **103px starting at y=320**. Row blocks are
  pinned to them; do not "improve" the spacing without re-measuring the plate.
- Backgrounds exist in 7-row and 8-row variants. `plateFor()` picks by row count. A
  table card stops at **8 rows** because the artwork has no more bands.
- Award tiles: 2 columns × up to 4 rows, tile 466 × 244, gap 20. The block centres
  itself between the title (ends y=163) and the foot (starts y=1240).
- Layout: title top left, GW and state top right, brand bottom left, url bottom right.
- Type: Passion One for the wordmark, Archivo Black for every number, Inter for the
  rest. This mirrors the site.
- Accents: lime `#d1ed19` for positive, coral `#ff9d88` for negative, both as a bar
  struck behind black text. Never colour the type itself — the plate runs from white to
  saturated colour and any mid-tone fails somewhere on it.

### Awards

`buildAwards(data)` in `src/services/awards.ts` evaluates about twenty rules over
ownership, the armband, the bench, money, transfers, chips and the table. Each has a
threshold so nothing trivial qualifies and a **rarity** weight.

`select()` then applies, in order:

1. A player event may be used once — the same haul cannot appear as two awards.
2. At most **two tiles per manager**, or one good week becomes a one-man show.
3. Rarity outranks magnitude.
4. **Kierroksen kuningas and Karu kierros rank last.** They trigger every week and exist
   only to keep the card from being empty, so they are the first to be pushed out.

Maximum eight tiles. GW1 produced six after deduplication from eight raw hits.

## Telegram

Cron runs every two minutes.

| Trigger | Message |
| --- | --- |
| 24h and 2h before deadline | Text reminder with link button |
| Picks published after deadline | **Old wide `.league-table` screenshot — still the old design** |
| 10 min after the last fixture reaches full time | Two messages, see below |
| `/farmisarja` | Link message |
| `/deadline` | Time to next deadline |
| `/id` | Answers with the id of the chat it was sent in |
| `/kortit` | Queues the post-gameweek report to the asker, as a preview |

The post-gameweek report is **two messages**: first the gameweek card alone with the
FARMISARJA LIVE button, then the standings and awards as a pair with no caption, no
link and nothing else. Telegram allows an inline keyboard on a single photo but not on
an album, which is why it is split.

### Why the report is assembled across cron ticks

Two limits pull against each other and neither can be tuned away:

- Browser Rendering on the **free plan** allows one request per 10 seconds, 3 concurrent
  browsers, and **10 minutes of browser time per day**.
- A Worker invocation is cancelled at **30 seconds**.

A capture takes about 9 seconds. Spacing three of them far enough apart to avoid a 429
runs past 30 seconds and the whole thing is cancelled — this was observed, not assumed.
So `advanceAlbum()` captures **one card per cron tick**, parks the PNG in KV, and the
tick that takes the final card sends both messages immediately, passing that last image
through memory because KV reads are only eventually consistent after a write.

Budget: one report is 3 captures ≈ 27 s of the daily 600 s, so roughly 20 previews a day
are affordable. A failed attempt costs quota too.

### Previewing without spending quota

Local Chrome captures the same cards and never touches Cloudflare:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --hide-scrollbars --force-device-scale-factor=1 --window-size=1080,1350 \
  --virtual-time-budget=15000 \
  --screenshot="C:/Users/jonir/Vetoliiga-LIVE/artifacts/cards/awards.png" \
  "http://localhost:5174/?card=awards"
```

Samples from GW1 are in `artifacts/cards/` (git-ignored).

## What FPL actually does, measured during GW1

These cost real debugging time. Do not re-derive them from assumptions.

- **`entry_history.points` does not update during live matches.** It sat at 0 while the
  squad had scored 3. Gameweek totals are composed from live element scores and the
  stored value is used only once it is higher.
- **FPL publishes provisional bonus into the API live**, both in the fixture stats and
  inside `live.elements[].stats.total_points`, while the match is still running. It
  appears part-way through the match, not at kick-off. An own BPS estimate was written
  and then removed — it can only disagree with the official numbers.
- **`finished` and `finished_provisional` are different things.** `finished_provisional`
  is full time; `finished` is the confirmed result and can lag for many hours. Bonus
  being published is *not* a signal that a result is settled any more.
- **`last_rank` is 0 when there is no previous rank**, and overall rank is reported as
  1 for everyone before anything is scored. Both must be hidden rather than drawn.
- Around the deadline FPL answers 5xx and picks return a mix of 404 and 503. That is
  normal and must render as the waiting view, not an error.

## Open tasks

1. **Deadline card.** The post-deadline moment still sends the old wide
   `.league-table` screenshot, which is the design that was dropped. It needs its own
   card: total points, form (from GW3), transfers, captain and chip if played. Note
   that in GW1 all of these are empty except the captain, so decide whether that card
   starts at GW1 as a captains card or from GW2. `captureTable` and `sendTablePhoto`
   in `worker/telegram.ts` exist only to serve this and can go once it is replaced.
2. **Revisit the dashboard table.** Explicitly deferred to look at again.
3. **Rename the dashboard award labels.** The table still uses the old shouted labels
   (ÖLJYPOHATTA, EI SAATANA, MELAPISTEET, SYÖKSYKIERRE). The cards moved to nicknames
   with an explanatory subtitle. Align the two so the same event is not named twice.
4. **Verify the first automatic report.** GW1 ends with FUL–CHE on Monday 24 Aug at
   22:00 local. The report should arrive about 16 minutes after full time. If nothing
   comes, `npx wrangler tail --format json` and look for `album_card_ready` and
   `album_sent`. Note the log is pretty-printed multi-line JSON, so split on `\n{`.
5. **Eighth manager.** `round-8.webp` and `total-8.webp` are ready. Nothing else needs
   changing; the card picks the plate by row count.

## Rules that keep being learned the hard way

- **Measure, do not eyeball.** Every alignment claim in this project was verified by
  reading pixels or bounding boxes back out of the browser. Two real bugs were found
  that looked fine: rows a half band low, and a leader bar landing on the movement
  arrow because the selector matched every span in the cell.
- **Watch selector specificity in `styles.css`.** It is a long file of layered
  overrides. `.app-shell > header` silently beat `.topbar`, and `.card > *:not(.bg)`
  forced `position: relative` onto an element that needed `absolute`. Card styles are
  prefixed `sc-` for exactly this reason.
- **Preserve alpha.** `convert('RGB')` on an RGBA plate turns transparency black and
  destroys the artwork. Always keep the channel and check `getextrema()`.
- Do not regenerate the shirt artwork in `public/kits/`. Do not reintroduce Vetoliiga
  branding, a theme switch, or demo data flashing during live loading.
- Never claim a live behaviour is verified without testing it against the real API.
