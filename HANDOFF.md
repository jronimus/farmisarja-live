# Farmisarja Live — handoff

Updated: 2026-08-23

Source of truth for continuing the project in a new conversation. Read it completely
before making changes.

## Start here

1. Run `git status --short` first. Do not reset, clean or discard the working tree.
2. `npm install`, then `npm run dev` for the dashboard.
3. Validation before any commit: `npm test`, `npm run build`, `npm run worker:check`,
   and `node scripts/check-overflow.mjs` with the dev server running. That one checks both
   pages at twelve widths each.
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
| `src/styles.css` | Dashboard styles, ~1400 lines, heavily layered overrides |
| `src/ShareCard.tsx` | The four Telegram cards |
| `src/cards.css` | Card styles, everything prefixed `sc-` |
| `src/services/awards.ts` | Award rules, thresholds, rarity, selection |
| `src/services/ownership.ts` | League ownership and effective ownership, for the player highlight |
| `src/services/priceChanges.ts` | FPL's published price-change numbers, and the two figures derived from them |
| `src/PriceChanges.tsx` | The price change page at `#/hinnat` |
| `src/Ticker.tsx` | The live event ticker under the header |
| `src/services/liveFeed.ts` | Reads the event log from the Worker |
| `worker/events.ts` | Derives the events by diffing snapshots, and serves `/events` |
| `src/services/liveDashboard.ts` | FPL response mapping and dashboard composition |
| `src/services/fplRules.ts` | Chips, free transfers, provisional autosubs |
| `src/i18n.ts` | FI/EN strings |
| `src/demoData.ts` | Ten-manager stress data for `?demo=1` |
| `scripts/check-overflow.mjs` | Asserts the page never scrolls sideways, at twelve widths |
| `.claude/launch.json` | Starts the dev server on port 5174 |
| `worker/index.ts` | Proxy routes, webhook, protected `/admin/card-screenshot?card=` endpoint |
| `worker/telegram.ts` | Reminders, card capture, staged report, bot commands |
| `public/cards/*.webp` | Card backgrounds, 1080×1350 |
| `public/kits/generated-gk/*.png` | Long-sleeve goalkeeper shirt source artwork, one per club code |
| `public/kits/optimized-gk/*.webp` | 512px transparent goalkeeper shirts used by the squad UI |

Goalkeepers use their own long-sleeve kit set. `Shirt` in `src/App.tsx` selects
`optimized-gk/` for `player.position === "GK"` and keeps `optimized/` for every
outfield player. The goalkeeper artwork follows the real 2026–27 goalkeeper-kit
references while reusing each club's Farmisarja sponsor treatment from its home kit.
Run `python scripts/prepare_gk_kits.py` after replacing goalkeeper source artwork.

## The dashboard table

The table is the oldest part of the project and the one that had drifted most. It was
tidied on 23 Aug; the rules below are what that pass settled on, and they live in the
last block of `src/styles.css` on purpose.

- **Six font sizes, no more.** `--fs-hero` 22px (position, gameweek points), `--fs-total`
  18px (season total), `--fs-lead` 13px (a cell's primary line), `--fs-sub` 11px (the name
  or figure under it), `--fs-meta` 9px (sub-figures and labels), `--fs-micro` 8px (chips).
  It had grown to eleven sizes, including a 13.33px that was simply an unstyled `<small>`.
- **One rhythm.** Every cell is a grid with `align-content:center`, `row-gap:3px` and
  `line-height:1.15`. Three cells used to carry a fixed `grid-template-rows:24px 17px 12px`
  sized for an award tag that no longer exists, which pushed their first line 5px below
  everyone else's.
- **No award names in the table.** The shouted labels (ÖLJYPOHATTA, EI SAATANA and the
  rest) were removed on 23 Aug. `awardFor()` still returns a `level` and a `tone`, which
  tint the winning figure; only the naming went. The nicknames live on the awards card.
- **Nothing relies on grey for legibility** on the share cards; the dashboard still uses
  `--soft` and `--faint`, which is fine on its own dark ground.

### Column widths

Every fixed column is the measured max-content width of the widest thing it can ever
hold, read out of the live DOM by cloning a row with `grid-template-columns:repeat(12,
max-content)` and worst-case text substituted in, plus whatever the header label needs
once it is allowed to wrap. The numbers and the reasoning are in the last block of
`src/styles.css`. Re-measure rather than nudge them.

The old set was guessed and wrong in both directions. `Yhteensä` sat in a 60px column
whose own header needs 69px, so that header was clipped at every window size. The captain
name had 85px for a name that reaches 134px. `Arvo`, `Vire`, `GW-pisteet` and `Pelattu`
together carried 106px that nothing ever used. The whole row also demanded 1268px inside
the 1173px a 1280px window gives it, and quietly hid the difference behind
`overflow:hidden` — the last column simply was not there on a 1280px laptop. The row now
asks for 1224px and fits.

The bench column carried `transform:translateX(-14px)`, a nudge toward a value column
that was 17px wider than anything in it. With the columns cut to their content that nudge
only pushed the value pill into the bench figure, so it is gone.

### The transfers column

Each transfer is one line: `out N → in N = ±D`. Names sit in `.tf-name` spans that
truncate, so the line can never overflow horizontally; the row grows vertically instead,
82px to 102px for four transfers.

Both names share one budget, and it is smaller than it looks: the points, the arrow, the
`=` and the difference are fixed, so at 1280px the pair of names had 97.8px between them
with single-digit points and 88.1px with double-digit ones. Measured against the 348
players who are realistically ownable, that fit 84.6 % and 69.5 % of possible pairs —
`Dewsbury-Hall → Gibbs-White` on 12 and 15 points truncated both names. It was not the
rare edge case the earlier note claimed.

Reclaiming the wasted column width, plus a 4px rather than 8px gutter on this one cell,
took the budget to 125.3px and 115.5px, or 98.6 % and 96.6 % of pairs. Folding the form
column into a popover freed 71px more, and the budget is now **162.9px and 153.1px, which
is 100 % and 99.9 %**: two of the longest names in the game, on double-digit scores, fit
whole. The per-transfer points stay. The longest realistically ownable name is George
Hemmings at 97px; Alexander-Arnold is no longer in the game at all.

### The form column

Form is a series of **settled** gameweeks, the last five of them, and the gameweek in
progress is not one of them. It joins the series when `event.finished` turns true.

This is not a style choice. `history.current[].points` is the stored entry total, and FPL
leaves that at its last processed value while matches are running — the same trap as the
gameweek total, which is why that one is composed from live element scores instead. A
running gameweek in the form series therefore disagreed with the GW column beside it: on
23 Aug the leader read 48 in form and 56 in GW points, an hour into the round. It also
read as a collapse every Saturday and recovered by itself overnight.

The column itself shows **only the average**. The five weeks are behind it, in a popover
that opens on click and closes on the next click anywhere or on Escape. That took the
column from 129px to 58px, and the 71px went to the two columns that needed it: the
captain, whose name now carries a highlight pill, and the transfers.

Inside the popover each figure carries its own gameweek number, `GW19 20 21 22 23`, with
the prefix written once. The label is the ink colour at `--fs-micro`, not grey: `--faint`
lands at 3.6:1 against the light row, and this is the smallest type on the page. It is
held back by size and weight rather than by contrast. Emphasising the newest figure
instead was tried and dropped: emphasis reads as *this is now*, and the one thing that
figure is not is the running gameweek, which is two columns to the right.

The popover is centred on its row and measures 134 × 43, so it never reaches past the 82px
row it belongs to — which is what keeps it clear of the table's own `overflow:hidden` on
the first and last rows. Its selector carries `.form-popover` rather than the bare element
because an earlier layer flattens every direct span of that cell:
`.manager-row .form-cell > span { padding:0; border-radius:0 }`.

### Highlighting one player

The select above the table lists every player anyone in the league owns, ordered by
**effective ownership**, and picking one paints the managers who hold him.

Effective ownership is FPL's own measure and the reason the figure passes 100 %: each
squad holding the player counts once, his captains twice, three times under a triple
captain, and a benched player counts nothing at all. Seven managers all captaining the
same player is 100 % owned and 200 % effective. Real GW1 numbers, which is the clearest
argument for showing it: Haaland 143 % from six squads, B.Fernandes 71 % from three
because two of them captain him, Calvert-Lewin 29 % from four because most of them bench
him. `buildOwnership()` in `src/services/ownership.ts` reads the squads through
`provisionalAutosubSquad`, so the armband and the eleven it counts are the ones the table
is showing under the current autosubs setting.

The switch beside the select reads **Vain avaus** and is off by default: turning it on
narrows the count to the eleven on the pitch, and the managers who own him but have
benched him drop out of the list and out of the paint. Effective ownership does not move
either way, because a benched player was already worth nothing in it — real numbers:
Calvert-Lewin 4/7 and 29 % with the switch off, 2/7 and 29 % with it on.

It is worded around what turning it *on* does, and it went through "Penkki mukaan",
"Myös penkki" and "+penkki" before that: a switch whose label describes the off state
reads backwards, and no amount of rewording fixes that. Invert the switch instead.

The mark is **the name, and nothing else**: an owner's team name is struck with the share
cards' own lime, `#d1ed19`, using the same
`linear-gradient(to bottom, transparent 0 46%, bar 46% 92%, transparent 92%)` the cards
strike a figure with — a highlighter stroke behind black text, never coloured type. The
captain's name in the captain column is struck the same way when the picked player is the
one wearing the armband, on mobile too. His card in the expanded squad takes a lime ring.

Washing the whole row was tried at four strengths and in two colours before that, and
every one of them was either invisible against the table's own striping or too much. The
row is not the fact; the name is. One accent, one meaning, in both places this league is
published.

The rows that were not picked have their **contents** dropped to 60% opacity, and come all
the way back on hover. That is what makes a stroke on one word findable in a table of
seven rows.

The contents, never the block. Every row background here is translucent over a dark page,
so fading the block itself lets that dark ground through and turns a light stripe into a
muddy third colour: measured at rgb(212,217,226) where the stripe it belongs to is
rgb(237,239,245). It looked like the striping had broken, because it had.

The stroke carries `width:max-content; align-self:flex-start` because both names are
stretched flex children: without it the bar runs the full width of the cell and reads as a
filled row again.

The club is in the option label because FPL's short names are not unique — a league can
easily hold two Fernandes.

### The header

`GW`, the live state and the played count share one card (`.gameweek-status`). The live
state is red text, `--live:#ff5f77`, not a red pill, and it does not pulse. The count sits
over a small `PELATTU` caption. The same card is used on mobile a size down; measured at
375px it ends 14px from the right edge with the language switch beside it.

## The live ticker

A strip under the header, on both pages, with the feed and the table on screen at once.
That was the requirement — and on a portrait second monitor a side rail was not an option,
because it would have cost the table half its columns on exactly the screen it is read on.

### FPL publishes state, not events

`/event/{gw}/live/` says Szoboszlai has one goal. It never says it went in at 20:31. Every
feed of this kind, LiveFPL's included, derives its events by diffing successive snapshots
and stamping the time itself, and so does this one.

The diff runs in `worker/events.ts` on the cron that already ticks every two minutes. It
compares eleven counters per player — goals, assists, own goals, cards, penalties saved and
missed, bonus, defensive contribution, saves — against the previous snapshot, and writes
both the snapshot and the log into **one** KV value under `feed:gw:N`.

One value, because the free KV plan allows 1,000 writes a day and a two-minute tick around
the clock is 720 of them. Writes only happen while football is being played: any fixture
`started && !finished_provisional`, plus a 30-minute grace so the bonus recalculations are
caught. A heavy Saturday costs about 200 writes.

Two counters are not events in themselves. **Saves** are worth a point per three, so the
feed reports the point and not every stop. **Bonus** moves by a point at a time and moves
back again, which is why it is filtered out by default and why a counter going *down* never
emits anything.

The page reads `GET /events?gw=N`, cached 30 s, every 60 s and on window focus. Which of
our teams own the player is joined **client-side** from the squads already loaded, so the
log itself stays small and the Worker knows nothing about the league.

### The look

The track is rendered twice and translated by exactly half its width, which is what makes
the loop seamless — the second copy arrives where the first left. Hovering stops it,
because a moving line you cannot read is decoration, and `prefers-reduced-motion` stops it
for good. The chevron opens a panel with the full log, a low-impact filter and an
only-our-players filter.

Owned players are struck in the same lime as everywhere else. One accent, one meaning.

**The Worker must be deployed for any of this to have data**: `npx wrangler deploy`. Until
then `/events` answers 404 and the ticker says it is waiting.

## The middle widths

Below 800px the table is cards. Above 1260px it fits whole. In between — a portrait
monitor, a half-screen window — it was neither: the grid asked for 1224px and
`.league-table` clipped what did not fit, so on a 1080px screen the last three columns
simply were not there. Four columns now step aside in that range, the four whose figures
are cumulative rather than about this gameweek: total transfers, chips, team value and
bench points. What is left fits from about 880px up, and `check-overflow.mjs` tests 1080
and 1200 alongside the rest.

## The price change page

`#/hinnat`. Two pages, no router: Pages serves the site from a subpath and a hash survives
that without any server rewrite. `view` is read from `location.hash` and kept in step with
`hashchange`.

### FPL publishes this itself now

Nothing here is modelled, and nothing here should be. Since 2026-27 the bootstrap carries,
per player:

| Field | What it is |
| --- | --- |
| `price_change_percent` | Progress toward the next change. 100 is where the price moves; negative is a fall |
| `price_change_projections` | Three entries, `offset` 0/1/2 days, each with `projected_percent` (can pass 100) and `likelihood`, −5…5 |
| `price_change_locked_until` | Set on about 38 players at a time |
| `price_change_calibrating` | Set on a handful whose numbers are not settled |

and `game_config.settings.price_change_deadlines` gives the exact change times, so the
countdown counts to a published moment rather than an assumed 01:30 UTC. The first one,
`2026-08-23T23:00:00Z`, is 02:00 Finnish time, which is exactly what FPL's own page shows.

`price_change_hourly_rate` is a **transfer count**, not a percentage, and is not what the
per-hour column shows. That column is derived: two projections exactly a day apart give
percentage points per hour, `(offset2 − offset1) / 24`. Checked against LiveFPL's own
per-hour column on the same players — 1.67 against 1.76, 1.93 against 2.11, 2.38 against
2.28. The estimated hours-to-change follows from that rate and the current progress.

The one thing that reads as a contradiction is FPL's own: Calafiori at 52.5 % projects
99.5 % for tomorrow, half a point short, so the outlook says *2 pv* while the derived rate
says *noin 28 h*. Both are shown, in separate columns, because they are separate
quantities.

### What the page carries

The union of LiveFPL's page and FPL's own, minus the duplicates: search, position filter,
club filter, risers/fallers/all, sortable columns, a progress bar, the projection, the
per-hour rate, ownership with its transfer trend, current price with the season's change,
lock and calibration markers, and paging with a page size.

Two things are ours rather than either site's: the **Omistajat** column, which names the
teams in this league that hold the player — the armband struck in the same lime as the
league table uses, a benched owner at half strength — and the **team filter**, which cuts
the six hundred rows down to one manager's fifteen.

Deliberately left out: a watchlist, which needs storage nobody asked for, and purchase and
selling prices, which are per manager rather than per player and belong to a squad view.

The numbers are up to five minutes old: the Worker caches `/api/bootstrap-static` for
300 s. Progress moves slowly enough that this does not matter, but it is why the page and
FPL's own can disagree in the last decimal.

### Navigation

Two destinations do not earn a hamburger. Hiding a two-item nav behind a menu costs a tap
and an overlay to reach something that fits on the screen; that pattern is for five or
more. They are **links**, with the current one underlined — a pair of pills reads as a
toggle, as though it changed a setting on the page rather than leaving for another one.
They sit in the header on desktop and on their own row under it on a phone, where the
header already has a wordmark, a gameweek card and a language switch competing for one
line.

The header is a grid of `1fr auto 1fr` above 800px so the middle column cannot move, and
everything that ticks is set in `tabular-nums`. Inter's proportional figures are not one
width — `1` is 4.86px against `0` at 7.61px — so a running clock in the right-hand group
shoved `GW 1` and the links about by up to 16px every second. That was measured off the
font rather than guessed at.

## Share cards

Four cards, each rendered by the app itself from live data at its delivered size of
**1080 × 1350**:

- `?card=round` — Kierroksen pisteet, ranked by gameweek points, captain in the meta line
- `?card=total` — Kokonaistilanne, ranked by total points, with rank movement arrows
- `?card=awards` — Kierroksen palkinnot, conditional award tiles
- `?card=deadline` — Siirrot ja kapteenit, sent once picks are readable after a deadline

Add `&demo=1` to render any card from demo data, which is the only way to see rank
movement and the transfer, chip and history awards before they can occur.

### Geometry, all measured rather than guessed

- The artwork carries its own row bands of **103px starting at y=320**. Row blocks are
  pinned to them; do not "improve" the spacing without re-measuring the plate.
- Backgrounds exist in 7-row and 8-row variants. `plateFor()` picks by row count. A
  table card stops at **8 rows** because the artwork has no more bands. The plates are
  named after the card, so `plateFor()` is `${kind}-${size}.webp` and adding a card means
  adding artwork under that name.
- The plates are the **v2 set**, which carries film grain. That grain does not compress:
  they are webp q90 at ~350 KB each, against ~20 KB for the smooth v1 plates. Dropping to
  q85 would halve it and keep 82 % of the grain, measured as mean absolute row difference.
- Award tiles: 2 columns × up to 4 rows, tile 466 × 244, gap 20. The block centres
  itself between the title (ends y=163) and the foot (starts y=1240).
- Layout: title top left, GW and state top right, brand bottom left, url bottom right.
- Type: Passion One for the wordmark, Archivo Black for every number, Inter for the
  rest. This mirrors the site.
- Accents: lime `#d1ed19` for positive, coral `#ff9d88` for negative, both as a bar
  struck behind black text. Never colour the type itself — the plate runs from white to
  saturated colour and any mid-tone fails somewhere on it.

### The deadline card

`?card=deadline` is the one card whose subject is not points. It is titled *Siirrot ja
kapteenit* and the row carries, from the left: place, team, manager and the settled total,
then on the right the hit and the chip, the captain, and under them the transfers written
out as `out → in` pairs.

Decisions worth not re-litigating:

- **The standing does not subtract this week's hit.** `totalPoints` from
  `liveDashboard.ts` is gross, with the hit added back, and the other cards subtract it. Do
  that here and a manager who takes a −4 drops down the table before a ball has been kicked.
  Rows are ordered by `manager.position`, FPL's own league rank, and the figure shown is
  `totalPoints - gameweekPoints`, which is the total carried into the gameweek. It is
  hidden at GW1, where it is zero for everyone. There are no movement arrows on this card.
- **Nothing on the card is grey.** The plate runs from white to saturated colour, so a
  mid-tone loses legibility somewhere on it. Every string is `--sc-ink`; hierarchy is size
  and weight alone. The player leaving is weight 500 and the one arriving 800, so the
  direction of a move is read without a second colour.
- **The transfer list is capped at four.** A transfer line measures 25px and the band
  leaves 67px under the captain, so two lines fit and three do not. Measured: four pairs of
  even the longest names still pack onto two lines, five spill onto a third. Beyond four,
  and on a wildcard or free hit which can move eleven players, the row states the count.
  `.sc-moves` also carries a `max-height` backstop so no row can bleed into the next band.
- Chips are named the way FPL names them: Wildcard, Free Hit, Bench Boost, Triple Captain.

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
| Picks published after deadline | The deadline card, alone, with the link button and no caption |
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

1. **Verify the first automatic report.** GW1 ends with FUL–CHE on Monday 24 Aug at
   22:00 local. The report should arrive about 16 minutes after full time. If nothing
   comes, `npx wrangler tail --format json` and look for `album_card_ready` and
   `album_sent`. Note the log is pretty-printed multi-line JSON, so split on `\n{`.
2. **Eighth manager.** `round-8.webp`, `total-8.webp` and `deadline-8.webp` are ready.
   Nothing else needs changing; the card picks the plate by row count.
3. **Verify the deadline card's totals and transfer lines against real picks.** The card
   itself was rendered from real GW1 picks on 23 Aug and is in
   `artifacts/cards/deadline-real.png`: real names, real captains, ordered by
   `manager.position`. Two parts of it are still unseen, because GW1 cannot show them —
   the settled total, which is hidden at GW1 where it is zero, and an actual `out → in`
   list, since nobody had transfers before the first deadline. GW2's deadline on
   **28 Aug at 20:30** is the first time both appear.

## What was fixed on 23 Aug, so it is not rediscovered

- **The narrow-window overflow was `100vw`.** `.view-tabs` capped itself at
  `calc(100vw - 62px)` and the topbar padded itself from `100vw` too. On a desktop window
  with a classic scrollbar `100vw` is about 15px wider than the layout, so the row of
  controls asked for more than the page had and pushed it sideways. A real phone has
  overlay scrollbars, the two agree, and nothing shows — which is exactly why this was
  filed as unreproducible. Both now use `100%`, and the flex rows carry `min-width:0`
  so a control gives way instead of the page.
- **`node scripts/check-overflow.mjs` guards it.** It loads `?demo=1` in headless Chrome
  at twelve widths and asserts `documentElement.scrollWidth == clientWidth`, naming the
  elements that stick out when it fails. It refuses to pass if the table never rendered,
  because an empty shell fits every width. It also greps the CSSOM for `100vw`, since
  headless Chrome draws overlay scrollbars and cannot reproduce that bug by layout alone.
  Widths under 600px are emulated as phones; a desktop window cannot be dragged that
  narrow, and emulating one there reports 15px of scrollbar nobody will ever see.
  It cannot see content that is clipped rather than pushed out — a column hidden by
  `overflow:hidden` still reports a page that fits, which is how the last column stayed
  missing for weeks. Chrome's `--screenshot` flag does not size the viewport reliably
  either; capture through `Page.captureScreenshot` if a screenshot has to prove a width.
- It found one real overflow nobody had noticed: at 320px the toggles beside the view
  tabs were 5px too wide for the page. `.toolbar` now wraps.

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
- **Do not size a column by eye, and do not trust a width already in the file.** Clone the
  row, set `grid-template-columns:repeat(12,max-content)`, substitute the worst content
  each cell can hold, and read the widths back. Half the table's widths were wrong.
- **A cell's worst case is not what it holds today.** The progress column was measured
  while every manager still had fixtures left, so the measurement never saw `PROVISIONAL`,
  the string that appears only once a squad has finished — 94px of it, in a 67px column,
  drawn straight across the season total. Enumerate a cell's states from the code that
  renders it, not from the data on screen.
