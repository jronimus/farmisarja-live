# Farmisarja Live — handoff

Updated: 2026-08-25

Source of truth for continuing the project in a new conversation. Read it completely
before making changes.

## Start here

1. Run `git status --short` first. Do not reset, clean or discard the working tree.
2. `npm install`, then `npm run dev` for the dashboard.
3. Validation before any commit: `npm test`, `npm run build`, `npm run worker:check`,
   and `node scripts/check-overflow.mjs` with the dev server running. That one checks both
   pages at fourteen widths each, and opens the highlight picker at each of them.
4. Source code, identifiers and comments in English. Visible page content in Finnish
   (the dashboard is bilingual FI/EN; the share cards are Finnish only).
5. Deploy only when asked. Pages deploys on push to `main`; the Worker needs a separate
   `npx wrangler deploy`.

## What is here

Three things, and the file is ordered as they are: the **dashboard table** at `#/`, the
**price change page** at `#/hinnat`, and the **live event ticker** in the strip under the
header on both. The Telegram share cards are the fourth, and they render out of the same
app at `?card=`.

Two of those are new since 23 Aug and neither has been seen against a live gameweek yet.
The ticker in particular needs the Worker deployed before it does anything at all — see
**Open tasks**.

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
| `src/PriceChanges.tsx` | The price change page at `#/hinnat`, and its two tabs |
| `src/TeamNews.tsx` | The availability page at `#/uutiset` |
| `src/services/playerNews.ts` | What FPL's status letters mean, and the flag FPL does not raise |
| `worker/articles.ts` | Two RSS feeds, parsed and filtered, served as `/articles` |
| `worker/fotmob.ts` | The club map and the FPL↔FotMob name matcher both FotMob readers need |
| `worker/rumours.ts` | FotMob's graded transfer rumours and its club-wide absence lists |
| `worker/lineups.ts` | Predicted elevens for the fixtures close enough to have one |
| `src/services/rumours.ts` | Reads that list and picks the strongest report per player |
| `worker/fixtures/ffs-feed.xml` | A real Fantasy Football Scout feed, saved 26 Aug, for the parser tests |
| `src/services/articles.ts` | Reads that list and orders the topic pills |
| `src/PriceHistory.tsx` | The history tab: what prices have already done |
| `src/services/priceHistory.ts` | Reads the change log from the Worker and groups it by night |
| `worker/priceHistory.ts` | Watches FPL's prices, writes down what moved, and serves `/price-history` |
| `src/Ticker.tsx` | The live event ticker under the header |
| `src/services/liveFeed.ts` | Reads the event log from the Worker |
| `worker/events.ts` | Derives the events by diffing snapshots, and serves `/events` |
| `worker/liveRank.ts` | Samples the global league, scores it live, and serves `/rank` |
| `src/services/liveRank.ts` | Reads that curve and looks a total up on it |
| `src/services/liveDashboard.ts` | FPL response mapping and dashboard composition |
| `src/services/fplRules.ts` | Chips, free transfers, provisional autosubs |
| `src/i18n.ts` | FI/EN strings |
| `src/demoData.ts` | Ten-manager stress data for `?demo=1`, built from real players |
| `scripts/check-overflow.mjs` | Asserts the page never scrolls sideways at fourteen widths, and that the picker menu contains its own contents |
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
- **Nothing relies on grey for legibility** on the share cards. The dashboard uses `--soft`
  and `--faint`, and both were measured and moved on 25 Aug — see **Readability** below.

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

The column shows the average **and where it stands**. FPL publishes
`average_entry_score` for every gameweek, so the figure is measured against the average of
the very same gameweeks — the manager's mean over his last five against everyone's mean
over those same five, not against one week's average — and the small figure beside it is
the difference. The tiers are ratios of that benchmark, 1.25 and 1.08 up, 0.92 and 0.75
down, which keeps them meaningful in a 30-point week and a 70-point one alike. The colour
never has to be trusted on its own, because the number beside it says by how much.

The label is gone. `KA 74.0` spent a third of a 66px column telling the reader what column
they were looking at. What the column measures is said once, in the header — a second line
under `VIRE` reading `VIIM. 5 GW`, 44px of it in a 50px opening — and the popover carries
the rest: the average, the difference, and the sentence that says what the difference is
against. The colour in the column never has to be taken on faith.

The popover is 178 × 106 and every part of it is doing something. The five figures are set
larger than they are in the column and spread across the whole width — the popover exists
to show them — and the sentence wraps under them rather than setting the width of the box.
Left as one line it made the box twice as wide as the numbers and left them in a corner
of it.

Beyond that the column shows **only the average**. The five weeks are behind it, in a popover
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

The picker above the table lists every player anyone in the league owns, ordered by
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

### The picker is a menu, and it holds two lists

`HighlightPicker` in `src/App.tsx`. A native `<select>` can hold a list and nothing else,
so "Vain avaus" had to sit outside it as a third control in the toolbar, and there was no
way to ask the list a question at all — least of all the one this league actually asks,
which is *who here owns Arsenal players*.

That question is a club and not a player, and it wants the same answer painted on the same
table, so **the clubs are a second tab and not a filter on the first**. A filter narrows
which players you may pick; what was wanted was to pick the club. The selection is one
value, `Highlight` in `src/services/ownership.ts` — `{ kind: "player" }` or
`{ kind: "club" }` — because the two are the same question and the table paints them
identically. Two pieces of state could both be set at once, and nothing on the page could
have drawn that.

- **A club row carries both numbers and neither twice**: `ARS`, *7/7 joukkueessa* under it,
  and **16** *pelaajaa* on the right. `picks` is squad places and not distinct footballers,
  because that is what the question means — six managers holding Haaland is six places City
  has taken in this league, not one — and it is what orders the list, so the big figure the
  row shows is the figure it is sorted by.
- **`ownershipOf()` takes the whole `Highlight`.** A club is captained when the armband is
  on any of its players, and it is *benched* only when every one of its players in that
  squad is: one on the pitch is the manager being exposed to it, and the other way round a
  squad with ten Arsenal starters and one Arsenal substitute would read as benching
  Arsenal.
- The player search matches the club too, so typing `liv` in the players tab still finds
  the three Liverpool players — the club column is right there in the row.
- The trigger is a `<button>` wearing `.period-select`, not a restyled button. Later layers
  in `styles.css` restyle that class twice over and a copy of it would drift from them.
- The menu closes on a click anywhere else and on Escape, which is the form popover's rule,
  and it stops propagation so its own controls do not close it. Arrow keys move one
  highlight and Enter takes it; a separate `:hover` style would have given the list two
  active rows at once, so the pointer sets the same index the keyboard does.
- The switch inside the menu shows its own effect for the first time: with it on, a club's
  benched players leave the count and a player benched by his only owner leaves the list.
  Outside the menu that was invisible.

**The menu paints `--menu`, never `--surface`.** Every glass theme in this file makes
`--surface` translucent — `rgba(246,247,255,.76)` in the one the page ships with — which is
right for a panel that sits *in* the page and wrong for one that sits *over* it: the
table's team names read straight through the first version of this menu. `--menu` is each
theme's own surface colour at full strength. Compositing the surface over `--page` instead
was tried and is wrong: in the glass themes `--page` is a dark leftover the visible page
does not use, and the menu came out a muddy grey.

**The filter row is two rows on purpose, and both of its rules earn their place.** A flex
row will not shrink below its own min-content and a grid track will not shrink below its
item, so the tabs at 145px beside a 145px switch made the menu's single column 300px wide
inside a 270px menu — and the option rows, stretched to that column, painted their owners
figures on the table behind. The list was blamed first and was only inheriting the track.
Side by side the two controls fit a phone's menu and not a desktop's, and a control block
that reflows between the two is worse than one that is the same everywhere.

`check-overflow.mjs` guards it now, and it needed a check of its own: the menu is
absolutely positioned, so a row too wide for it never pushes the page and the
sideways-scroll assertion cannot see it — which is how this shipped twice. `MENU_PROBE`
opens the picker, walks both tabs and asserts the menu contains its own contents. Geometry
and not paint, because `overflow:hidden` on the menu turns the same bug from a spill into a
clipped figure. Reintroducing the flex row fails it at 8 of the 14 widths; below 800px the
picker takes the whole toolbar row and the menu is wide enough for both controls, which is
exactly why eyeballing it on a phone proved nothing.

No viewport unit in the menu's width, and no cap either. A cap only ever bound on a phone,
where the trigger is the full width of the row and a narrower menu under it read as
misaligned. `100vw` is the bug `check-overflow.mjs` greps the CSSOM for.

The switch reads **Vain avaus** and is off by default: turning it on
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

### The squad panel

The eleven are ordered by line and then by squad position. A substitute keeps his bench
`squadPosition`, so sorting by that alone dropped him after the forwards and opened a
second midfield heading behind them.

Each card's foot is three bands the full width of the card, touching, reaching its edges:
the score, the fixture, and ownership. Only the last is rounded, because only the last is
at the bottom. The fixture band carries FPL's own 1–5 difficulty as its colour — that is in
the API as `team_h_difficulty` and `team_a_difficulty` and needs no inventing — and the
score carries the state as the colour of the figure, purple settled, green live, amber to
come, which is what the legend above the squad already spells out. There is no state dot:
a second mark for the same fact read as a stray bullet.

**A player who has not kicked a ball gets a dash, not a nought**, and the kick-off in place
of the venue letter.

One word, and which word depends on how far away the match is. The clock is only worth
printing on the day it matters; before that the answer to "when does he play" is a day, not
a time. Inside a week the weekday says it, and past a week only a date does — a gameweek
can run over two weekends, and then "la" would name two different Saturdays. Every form
fits the 41px band on a phone with room to spare, so there is one rule and no breakpoint
behind it. A colour alone was not enough to carry that at 14px on a light
band, and the nought was wrong anyway: it is the same nought a player who played badly
gets, and those are not the same thing. The dash says which without raising its voice.

`.player-bottom` was `position:absolute; left:5px; right:5px; bottom:9px` from an older
design where the stack floated inside the card's padding. That is why the bands stopped
short of the edge and why no margin would move them. It is back in the flow.

**The name decides the card.** Two lines are allowed and the room for the second is
reserved on every card, so the grid stays level whether it is used or not.

On a phone the squad stays the two-row grid of eight it has always been, which gives a card
43px. A formation layout was built and rejected: five to a row gave the names 66px but cost
the squad 858px of height where the grid costs 313. So the name is fitted to the card
instead. It breaks out of the card's padding to use all 43px, and its size is stepped by
**the longest piece of the name that cannot be broken** — a space or a hyphen can wrap on
its own, a surname cannot:

| Longest unbreakable token | Size |
| --- | --- |
| up to 8 characters | 8px |
| 9–10 | 7px |
| 11 or more | 6px |

The steps are measured, not guessed: at 43px, "B.Fernandes" needs 49px at 8px and 37px at
6px. With them, the only name in the league that still takes two lines is João Pedro, and
it wraps at its space, which is where a two-word name should wrap.

### Autosubs count

`pick.multiplier` is 0 for a bench player until FPL settles the fixture, so `gameweekPoints`
is short by whatever a substitute has already scored. With the autosubs switch on, the
table showed the substitution and did not count it: Jankon betoni read 54 against LiveFPL's
56 on 23 Aug, which was Groß's two points sitting in a shirt the total ignored.

`provisionalGameweekPoints()` scores the eleven that is on screen, and `liveManagers` — one
memo at the top of the component — carries the corrected gameweek and season totals.
**Everything in the table reads `liveManagers`, never `data.managers`**, so the sort, the
awards, the medals and the figures cannot disagree about what a manager has scored.

**The share cards read it too**, and did not for all of GW1: `ShareCard` was handed raw
`data`, so every card sent that gameweek was short a substitute's points. It is handed
`{ ...data, managers: liveManagers }` now. A card and the site must never disagree, and the
awards are built inside the card from the same list.

### Overall rank movement

`previousOverallRank` is 0 when there is no previous gameweek, and 0 means *unknown*: the
row draws no movement at all. It used to fall back to this gameweek's stored rank, which
compared the live figure against the stale one and called the gap movement — in GW1 a
manager got a green pill or no pill depending only on which of the two numbers FPL had
refreshed last.

### The header

`GW`, the live state and the played count share one card (`.gameweek-status`).

The state reads **ALUSTAVA** or **VAHVISTETTU**, from `t.fixtureProvisional` and
`t.fixtureFinal` — the same two strings the fixture list uses, and the same words the share
cards have used all along. It said FINAL and PROVISIONAL on a Finnish page for as long as
those were inline literals in `App.tsx`, in the badge and in the table's progress cell
both. The caps are `text-transform` now rather than typed into the string, so all three
places can share one word.

Measured, because this column has been sized wrong before: VAHVISTETTU is the longest of
the four and renders 60px in a 72px column, leaving 12px of clear space to the season
total beside it — more than the 8px gutter the row uses elsewhere. Note that `?demo=1`
carries `pointsFinalized: false` and unfinished fixtures, so **the demo never shows this
cell's worst case** and `check-overflow.mjs` cannot see it. Measure it on live data.

#### Handing the card over to the next gameweek

Twelve hours after a gameweek is confirmed, the card stops being about it: the number
becomes the next gameweek's and the badge becomes a countdown to its deadline.
`gameweekHandsOverAt()` in `src/services/fplRules.ts`.

Both halves of that are load-bearing. FPL leaves `is_current` on a finished gameweek long
after the football is over — on 25 Aug every GW1 fixture read `finished: true` while the
event still read `is_current`, so without this the card would have said GW 1 VAHVISTETTU
for three days while the only thing worth counting was Friday's deadline. But handing over
the moment the fixtures are confirmed would mean the confirmed state is never seen at all:
it would appear and be replaced on the same tick.

**The confirmation is derived, because FPL publishes no timestamp for it.** It confirms a
gameweek's fixtures together at 09:00 UK the morning after the last match, and the model is
checkable against what happened: GW1's last kick-off was 20:00 London on Monday 24 Aug, the
model puts the confirmation at 09:00 on Tuesday, and the fixtures actually flipped at 09:13.
Thirteen minutes out, on a twelve-hour delay. The clock change is read back out of
`Europe/London` rather than tabulated, and there is a winter case in the tests for it.

The handover is gated on the fixtures really being confirmed, so the model can only ever
delay it and never bring it forward on a gameweek FPL has not finished with.

**Only the card moves.** The table, the awards and the share cards stay on the gameweek
that has the points, and the card gives up its played count and its fixture menu along with
the old number, because both of those are about the gameweek it just left. One card, one
gameweek — a GW 2 heading over a 10/10 PELATTU from GW 1 is worse than either half alone. The live
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

The diff runs in `worker/events.ts` on the cron that ticks every minute. It compares eleven
counters per player — goals, assists, own goals, cards, penalties saved and missed, bonus,
defensive contribution, saves — against the previous snapshot, and writes both the snapshot
and the log into **one** KV value under `feed:gw:N`.

One value, because the free KV plan allows 1,000 writes a day. Writes only happen while
football is being played: any fixture `started && !finished_provisional`, a 30-minute grace
so the bonus recalculations are caught, and the twelve minutes before a kick-off. A heavy
Saturday costs about 400 writes at a minute a tick, 200 at two.

**A baseline before the whistle is what makes the opening minutes visible.** Without one,
the first tick of a match seeds the snapshot in silence and anything already scored is
inside that baseline for good — a goal in the first minute was lost that way on 24 Aug while
the points column had it. Only the very first write of a gameweek is silent now; after that
a player absent from the last snapshot has just kicked off or just come on, and what he has
done since is reported.

Three counters are not events in themselves:

- **Saves** are worth a point per three, so the feed reports the point and not every stop.
- **Defensive contribution** is a running count of clearances, blocks, interceptions and
  tackles that ticks up several times a minute for half the pitch. Reporting every increment
  buried the goals under it. It fires once, where the two points land — 10 for a defender,
  12 for anyone else, never for a keeper.
- **Bonus** is the one counter that legitimately falls: three, two and one go to the top of
  the bonus points system and a player is promoted and demoted between those places while
  the match runs. A line carries the place left as well as the place taken, and fires both
  ways. A bare "+2" after a bare "+3" reads as five gained, and a demotion read as a gain.

**A line is worth what that event is worth, not what the player gained on the tick.** FPL
publishes it per stat in `explain`, so the feed stores that beside the counters; modelling
the scoring from position and rules would only go stale. Without it a goal and the bonus
that landed with it both read +8.

`repairEvents` mends logs written before those rules, behind `REPAIR_VERSION`. It runs
inside the cron because that is the only writer of the key: editing the KV value from
outside is overwritten by the next tick, which cost three attempts to learn on 24 Aug.

**There is no event time to be had.** The fixture stats carry the player and the count and
nothing else, and every `pulse_id` FPL returned for GW1 was 0, so the Premier League's own
timings cannot be keyed from it either. A line is stamped when the feed noticed it, which is
why the match minute is not printed beside it.

The page reads `GET /events?gw=N`, cached 30 s, every 60 s and on window focus. Which of
our teams own the player is joined **client-side** from the squads already loaded, so the
log itself stays small and the Worker knows nothing about the league.

### The look

**It stands still.** A line that is always moving is a line you cannot read, and the one
thing worth noticing in a feed — that something just happened — is exactly what constant
motion hides. The newest arrives at the left, pushes the rest along, and holds a lit
surround for twenty-five seconds: long enough to catch on a second monitor, short enough
that two goals a minute apart are still told apart. The strip scrolls by hand to look back.
The chevron opens a panel with the full log, a low-impact filter and an only-our-players
filter.

Nothing is marked fresh on the first read: everything already in the log when the page
opens is history, not news.

The padding sits on every line rather than only the lit one, or a line changes shape as it
arrives and again as it cools. The highlight is a plain wash with no outline — a ring made
a lozenge of a line of text.

A line leads with what it is about. A goal or an assist is about the tie, so the tie comes
first with its score, and the player's half of both — his club and the figure that just
moved — is set in bold against the same colour. Anything else is about the player, and
then his club is simply named, written out rather than in three letters. The Worker sends
`clubName` alongside the three-letter `club` so the page needs no table of its own to keep
current each season.

**The icons are drawn, not emoji.** Emoji are a different typeface on every platform, they
ignore the colour they are given, and at 12px on a dark strip half of them came out as grey
smudges. They are lucide icons now, coloured by what happened: a yellow card is yellow, a
goal is the accent, a sending-off is red.

There is no rail down the left of the panel rows. It marked the lines involving one of our
players, which is what the team name printed under each of them already says.

Our teams are **named, not painted**. The lime stroke belongs to the table, where it answers
"which rows"; a ticker line is already about one player, so painting the name there was
decoration. A captain is marked `(C)` after the team.

Two separators, because there are two kinds of gap: a middle dot between the team names
inside a line, and a hairline rule between the lines themselves. There is no clock — on a
strip that says *just happened* by lighting up, the wall-clock time was the least of what a
line had to carry.

**The Worker must be deployed for any of this to have data**: `npx wrangler deploy`. Until
then `/events` answers 404 and the ticker says it is waiting.

## The live overall rank

FPL does not publish one, and it cannot be derived from what it does publish. It is built
here, and it is the one number on the page that is an estimate — so it is printed with a
tilde, `OR ~2 648 280`, and never as though it were FPL's own.

### Why FPL's own figure will not do

`summary_overall_rank` is stored, not live. It does not move at all while matches run, and
even once every fixture is confirmed it still excludes every autosub in the game: on 25 Aug
four of these seven rows showed more points than the rank beside them belonged to — Jankon
betoni 56 against a rank for 54, Tussulan voittajat 37 against a rank for 34. The tooltip
called it *Arvioitu live-yleissija*, which it was not on either count.

### What makes it possible

Two things, both checked before a line was written.

- **A rank is a pure function of total points.** Every manager on 87 points holds rank
  21 754 — visible on any page of the global league, where all fifty rows of page 500 share
  one rank. So a rank is only ever a count of who stands above a total, and nothing has to
  be interpolated.
- **Picks freeze at the deadline.** The expensive half happens once a gameweek; every tick
  afterwards is arithmetic on the `/event/{gw}/live/` payload the feed already reads.

The global league, id 314, is pageable end to end at 50 rows a page, and any entry's picks
are public. So `worker/liveRank.ts` samples the league, fetches those squads once, and
rescores them every tick.

### The shape of it

- **120 pages of 8, spread on a log scale**, which comes to **106 unique pages and 848
  managers** once the low end stops colliding — the first ten pages asked for are 1 to 10,
  and the last three are 145 326, 160 867 and 178 069. A rank is read as a proportion —
  fifty thousand places matter at rank 600 000 and are invisible at rank eight million — so
  evenly spaced pages put the resolution in the wrong place. Measured with an even spread:
  6.5 % out at the top of this league and 0.1 % at the bottom. Each page carries the weight
  of the field between its neighbours' midpoints, which is what lets an uneven sample still
  add up to a whole.
- **20 requests a tick**, which finishes a sample in under an hour and leaves room under the
  50-subrequest ceiling for the feed and the Telegram schedule. It is also a public API being
  read in bulk, and twenty a minute once a week is a rate worth being able to state plainly.
- **Nothing is published until the sample is whole.** Pages are fetched in order, so a
  half-built sample is all top-of-the-table managers carrying weights that claim to speak for
  the whole field, and a curve from it would put this league far below where it is. There
  are hours between a Friday deadline and a Saturday kick-off; it waits for them.
- **The curve is computed when the page asks for it, and never stored.** A stored curve
  needs an interval, and every interval is wrong: fast enough to keep step with the ticker
  costs about four hundred KV writes on a heavy Saturday on top of the four hundred the feed
  already spends against a free-plan thousand, and slow enough to afford leaves the rank
  standing still for minutes after a goal has appeared in the strip beside it. Computed on
  request there is no interval to be wrong — the sample is already in KV, the live payload is
  a cached fetch, and scoring 960 squads is arithmetic. The response carries a minute of
  cache, so the work happens once a minute however many people are watching and not at all
  when nobody is. **The whole feature costs no KV writes at all beyond building the sample.**
- **Points stop moving at `finished`, not at `finished_provisional`.** The second is only
  full time; bonus is still being recalculated in between, and FPL now confirms a whole
  gameweek at 09:00 UK the morning after its last match. A first attempt gated the rewrites
  on `finished_provisional` and would have frozen the rank on Sunday evening for the two days
  the scores were still moving. Computing on request honours the distinction for free; the
  `settled` flag on the curve reports it.
- Provisional autosubs are applied to every sampled squad by the same rule the table applies
  to ours, because otherwise the field is under-scored and our own rows look better than they
  are. FPL rewrites the multipliers itself once it settles a fixture, so this only covers the
  hours in between — which are the hours the number is watched.

### What was measured

Against 195 real managers drawn across the field, before any of it was written:

- **Scoring is exact.** All 104 squads with no autosubs matched FPL's own gameweek points to
  the point. Every one of the 87 that disagreed had autosubs, and disagreed upward — which
  is how we know the disagreement is the autosubs and not the scorer.
- **Autosubs are worth 2.09 points to the average manager.** 44 % of the field gains
  anything at all, and those that do gain 4.76 each.
- Which is why looking a corrected total up on FPL's own curve is wrong, and by a lot. Our
  leader gained nothing from autosubs, so with the field gaining two points he goes **down**:
  642 802 becomes 787 102.

And then against LiveFPL, which publishes an exact live overall rank from its own
aggregation of the whole game — the only independent check there is. On the 195-squad
sample, through the real code path:

| | pts | LiveFPL | ours | error |
| --- | ---: | ---: | ---: | ---: |
| Tiksi United FC | 67 | 787 102 | 776 221 | −1.38 % |
| Jankon betoni | 56 | 2 678 094 | 2 648 280 | −1.11 % |
| Karjarannan Hurjat | 52 | 3 771 860 | 3 835 439 | +1.69 % |
| Airola Albion | 49 | 4 675 372 | 4 657 318 | −0.39 % |
| KERPA RULZ | 37 | 7 662 365 | 7 579 557 | −1.08 % |
| Tussulan voittajat | 37 | 7 662 365 | 7 579 557 | −1.08 % |
| Pirkkolan Beckham | 34 | 8 096 899 | 8 173 136 | +0.94 % |

Worst error 1.69 %, on a fifth of the sample the Worker will draw. Note that KERPA RULZ and
Tussulan voittajat share a rank in both columns, which is the pure-function property again.

**This can be checked every week.** Once a gameweek settles, our seven managers get their
true ranks and the estimate's error can be read off them. Do that rather than trusting the
figures above to keep holding.

### The estimate stands down

**It is only reached while FPL's own rank belongs to a different total than the row prints.**
`rankedPoints` on each row is the season total FPL ranked; when it equals the figure the
table shows, that rank is the real thing and there is nothing left to estimate. So the page
prefers FPL's number the moment FPL makes it exact, and stops asking the Worker for a curve
nobody will read — no flag, no timer, and nothing to keep in step.

That happened while this was being written. FPL reprocessed GW1 at about 12:40 on 25 Aug,
every row's `rankedPoints` came into line with its total, and the tildes disappeared by
themselves. Which also produced the one measurement that matters — **the estimate against
the official ranks, not against LiveFPL**:

| | pts | FPL, official | ours | error |
| --- | ---: | ---: | ---: | ---: |
| Tiksi United FC | 67 | 785 979 | 776 221 | −1.24 % |
| Jankon betoni | 56 | 2 672 977 | 2 648 280 | −0.92 % |
| Karjarannan Hurjat | 52 | 3 764 313 | 3 835 439 | +1.89 % |
| Airola Albion | 49 | 4 665 759 | 4 657 318 | −0.18 % |
| KERPA RULZ | 37 | 7 648 360 | 7 579 557 | −0.90 % |
| Tussulan voittajat | 37 | 7 648 360 | 7 579 557 | −0.90 % |
| Pirkkolan Beckham | 34 | 8 083 373 | 8 173 136 | +1.11 % |

Worst error 1.89 %, on a fifth of the sample the Worker draws. And the prediction that
mattered held: our leader gained nothing from autosubs while the field gained 2.09 points,
so the estimate said he would fall from 642 802 to about 776 000 — FPL now says 785 979.

### Deployed, 25 Aug

`npx wrangler deploy` at 13:47. The sample started on the next cron tick and `wrangler tail`
showed clean ticks with no `rank_sample_error`. Progress is not on any endpoint, so read it
straight out of KV:

```bash
npx wrangler kv key get --binding TELEGRAM_STATE "rank:gw:1" --remote
```

`pending` counts pages left, `queue` counts squads still to fetch, `entries` counts squads
in hand, and `completedAt` appears when it is whole. Pages are all taken before any picks,
because each page is what produces the queue the rest of the budget is spent on. From empty
it is about 45 minutes.

Nothing shows on the page until the sample completes, and for GW1 nothing will show even
then: FPL reprocessed it at 12:40, so every row's rank is already exact and the estimate
stands down. **The first time this is seen for real is GW2's opening kick-off**, when FPL's
own figure freezes and ours does not.

## Readability, and the one thing behind most of it

A pass on 25 Aug, measured before anything was changed: contrast computed per style against
the composited background, sizes read out of the DOM at 375 and 1280, tap targets and focus
walked element by element. **Fifty-three distinct text styles, of which twenty-four failed.**
After it, none do — worst on the table 5.07:1, worst on the price page 4.53:1.

### The panel was a mid grey, not a near-white

`--surface` was `rgba(246,247,255,.76)` over a dark page, which composites to **`#bcc2c7`**.
Every secondary colour had been chosen against a near-white panel, so on the real ground
`--text` sat at 9.65:1 and everything else between 2.1 and 3.7. That one value explains most
of the twenty-four: the club-and-position line under a player was **1.88:1** across 123 rows,
the overall rank **2.13:1**, and the price page's own headline figures — `+122.4 %`, `+3.21`,
the ownership arrows — **2.68:1** on nearly three hundred rows.

At `.96` the panel is `#eceef6`, which still reads as glass — it is not white and the
`backdrop-filter` is untouched — and carries `--soft` at 5.06 and `--green` at 4.69. Two
tokens went a shade darker with it, because even on an opaque panel they fell short:
`--faint` `#7d8297` → `#5f6373`, `--red` `#d53755` → `#b42f48`, and `--green` `#007a43` →
`#00703e`. **None of the three is used on a dark surface** — the ticker and the topbar spell
their greens out in white and `#42f5a1` — so darkening them costs nothing elsewhere. That was
checked, not assumed.

### Text on the page rather than on a panel

The price page's foot and its footnote sit on the page ground, and they were `--soft` and
`--faint`: tokens picked for a light panel, rendering dark grey on dark green at 3.02:1 and
3.33:1. `--page-ink` is declared beside every `--page` for exactly this, and is light where
the ground is dark.

### The head band is lighter than a row

`--soft` clears 5:1 on a row and only 3.94:1 on the head, on both pages. Both heads take
`color-mix(in srgb, var(--soft) 62%, var(--text))` rather than a seventh grey being invented
for one band. Note that `.table-head .sort-header:not(.active)` and `.price-head > span` are
the rules that actually win — changing the base `.sort-header` colour does nothing.

### The rest of the pass

- **The overall rank was the smallest and faintest thing on the page**, at `--fs-meta` in
  `--faint`: 2.13:1 on desktop and 7px on a phone. It is now `--fs-sub` in `--soft` at
  **5.07:1**, and 9px on a phone. It is also the one figure the page works out for itself, so
  it had the least business being unreadable.
- **Nothing showed where the keyboard was.** Two `:focus-visible` rules existed in the whole
  file and two inputs set `outline:none`, leaving 18 of 23 focusable things invisible to
  anyone not using a mouse. One rule now covers them all, written out rather than wrapped in
  `:where()` so nothing can outrank it by accident.
- **No text under 8px.** A phone had 6px on `PELATTU` and 7px on the chips and the rank,
  under the project's own `--fs-micro`.
- **Figures in the table are `tabular-nums`.** They are read down a column and Inter's `1` is
  4.86px against `0` at 7.61px, so a live score shifted inside its own cell every time it
  moved. The header had been tabular since the clock jittered the row; the table never was.
- **Seven font sizes became six again**: the column headers were 10px, which is in no
  `--fs-*` step, and are now `--fs-meta`.
- **Tap targets.** The nav links went from 22px to 36 and the ticker chevron from 20×24 to
  38×38. The header's own controls stay at 28–30: they were measured to fit 375px beside the
  wordmark and the gameweek card, and WCAG 2.2's floor is 24×24 — the 44 everyone quotes is
  Apple's guidance, not the bar.

### Two things that were checked and left alone

Colour is never the only carrier — prices have a sign, ranks an arrow, fixtures a word. And
`--text` was already 9.65:1, so what is actually read was never the problem.

### If this is measured again

The instrument matters. A naive walk up the ancestors for a background misses pseudo-elements
and `backdrop-filter`, and the first run of this pass was taken in a collapsed browser pane
reporting a viewport of 0, which put the whole page in its phone layout. Both were caught by
checking a figure by hand — `--faint` on the panel, computed at three gradient stops — before
believing any of it.

## The demo data

`?demo=1` exists to stress the layout and to let a feature be looked at when no gameweek is
running, so it has to be **plausible**, not merely present.

The players are real, lifted from the 2026-27 bootstrap with their own clubs, positions,
prices and ownership. Squads are legal ones: fifteen players, two goalkeepers, at most
three from a club, a real formation. Every figure a manager row shows is computed from that
manager's own squad — the gameweek total is what his eleven has actually scored, and the
captain is the player wearing the armband, not a name typed in beside him.

**The columns are deliberately out of step.** The old set listed form in the same order as
the season total, so sorting by form could not be told from sorting by total and the column
could not be tested at all. Form, value, bench and transfers now each rank differently from
the total and from each other. Overall rank is the one thing that follows the total,
because it does in the game.

It also covers the states the table has to draw: all five fixture-difficulty colours, seven
unplayed players showing a dash, and kick-off labels in each of their three forms.

**Managers share players, as a league does.** Haaland is in eight of the ten squads,
B.Fernandes in six, Calafiori in four — which is what the ownership column and the
highlight exist to show, and what nothing in the old set could demonstrate.

That was not only a data choice. Every squad player carried an id of `seed * 1000 + index`,
so the same footballer in two squads was two different players to every piece of code that
joins on an id, which is all of them. Ids come from the pool now, one per footballer, and
his live score is derived from that id too — two managers holding him cannot be shown two
different numbers.

The pool is 119 players, which is 7 × 17 — a squad builder walking it with a stride of 7 or
17 sees a fraction of it and comes back short. The strides are coprime with it, and a squad
that is not fifteen players throws rather than rendering something impossible.

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

### The prediction column names a change time, not a projection offset

`outlookFor()` takes the hour the rate says progress reaches 100, and finds the first
published deadline after it. The page then names the day that deadline **belongs to**.

Two things have to be right and only the second was, on FPL's page and here:

- **A change at 02:00 belongs to the evening before it.** Seventeen hours away at
  breakfast, it is tonight's change, and everyone reading the page calls that today. That
  is what FPL's `offset` 0 meaning *today* encodes, and it is correct.
  `daysUntilChangeDay()` counts from the day the deadline's own window opened — the
  previous change, 24 hours earlier — not from its own calendar date. A naive date
  difference was written first and printed *huomenna* for tonight.
- **An offset is a day from now, not a change time.** This is the part FPL gets wrong.
  Sangaré four hours from 100 crossed well before tonight's 02:00, but the projection that
  first passed 100 was `offset` 1, so the page said *huomenna* while the column beside it
  said *noin 4 h*. Conversely Calafiori's 20 hours land at about 06:00 — four hours *past*
  tonight's deadline — so his change is the following night, where FPL again said
  *huomenna* by reading `offset` 1.

Both columns are now the same arithmetic, and the check is the one sentence that settles
every row: **is the crossing before the next change or after it.** Against a 17-hour
deadline: 4 h → *tänään*, 20 h → *huomenna*, 33 h → *huomenna*, 54 h → *ylihuomenna*,
already past 100 → *tänään*.

### The line is not a hard edge, so the column does not draw one

A night stated flatly when the projection lands a point either side of 100 claims a
precision the rate does not have. `outlookFor()` therefore reads the change **before** the
one it named and the one **after**, and returns a `couldBe` when either is within
`BORDERLINE_POINTS` of the line. The page prints it as a second line under the night, at
9px in `--faint` — the qualifier under the figure it qualifies, which is what the rate,
ownership and cost cells beside it already do, so the row keeps its 56px and the outlook
cell keeps the page's own rhythm.

`Nousee tänään` / *ehkä vasta huomenna*, or `Nousee huomenna` / *ehkä jo tänään*.

**The margin is in points of progress, not in hours**, and that is the whole decision. An
hour of slack is worth a different distance to every player: at 0.9 an hour it is 0.9
points and at 2.4 an hour it is 2.4. Points are what settles it — the meter either reads
100 at 02:00 or it does not — and they are the quantity the rest of the column already
runs on, which is why `maybeThisWeek()` now measures against the same constant instead of
its own 95.

**Five points**, because that is about what the rate itself is worth over a night. It is
derived from two projections a day apart, and against LiveFPL's column it ran 5–10 % out
(1.67 against 1.76, 1.93 against 2.11, 2.38 against 2.28); over seventeen hours at one or
two points an hour that is 1.7 to 3.4 points before the transfer flow moves at all. Five
is a rate a third off over what is left of the window. Ten is a rate that has stopped
being the same number.

Real rows on 25 Aug, with 16 h 38 m to the change: Calafiori at 82.3 % and 1.07 an hour
lands on **100.1** — over the line by a tenth of a point, so *Nousee tänään* carries *ehkä
vasta huomenna*. Gyökeres at −79.7 % and −1.40 clears it by 2.4. Three rows in a hundred
carried a caveat, which is the point: it means something when it appears.

The day names are a string per language, not a count and a unit: Finnish has *ylihuomenna*
and English has nothing to translate it with. Only past three days does either fall back to
counting, `outlookInDays`, which is *N päivän päästä* rather than *N pv* — the column has
the room for it, measured at 127px of a 150px column for the longest form it can hold.
That rung is unreachable while FPL publishes three deadlines at a time and is written for
the week it publishes more.

The column reads as a ladder of certainty and each rung says how sure it is: a named night
(*tänään*, *huomenna*, *ylihuomenna*), then *Saattaa nousta tällä viikolla*, then *Tuskin tällä
viikolla*. The last of those was *Ei muutosta näkyvissä*, which claimed more than the page
knows — it is not that nothing is moving, it is that this rate does not get there before
Friday. Every rung is now about the same week, so the three can be read against each other.

Past the last change of the week the column stops naming days, because there is no day left
to name: a rate stretched further than FPL will announce a time for is a guess about a
night nobody has published. `lastChangeBeforeDeadline()` is where the week ends — the last
published change before the gameweek deadline, which on 25 Aug was 02:00 on the Friday the
deadline itself falls on. FPL's list already stops there, and the deadline is checked
anyway so a longer list could not stretch the week silently.

But *no day* and *nothing happening* are two different facts, and a squad is safe until
Friday or it is not. So there is a third state between them, from `maybeThisWeek()`:
**a player projected past 95 % by that last change reads *Saattaa nousta tällä viikolla***,
or *laskea*. Real fallers on 25 Aug: Estêvão at −24.0 % and −1.10 an hour reaches −95.5 by
Friday's change, which is 69 hours out against a week that ends at 65 — near enough to say
so, not near enough to name a night.

It is a guess and it is set as one: the direction's colour at 64 % strength against
`--faint`, weight 600 rather than 800. The hedge is only made for a player already going
the way his rate pulls; one who has turned around would be projected straight through zero
and out the far side, and 40 % falling at 2.5 an hour would announce a fall for a meter
that is still on its way up.

The per-hour column keeps printing its estimate under all of this, because an hour count is
not a claim about which night anything lands on.

Under the table, and only under it, is one footnote: the numbers are FPL's, the rate is
derived, and a rate is where something leads rather than what it will do. It is set at 10px
in `--faint` and capped at 82ch, with no box around it — a tinted panel would give a caveat
more weight on the page than any row of the table it qualifies, and a caveat placed above
the thing it qualifies reads as a warning about the page itself.

The demo market builds its deadlines relative to now — three nightly changes and a gameweek
deadline on the evening the last belongs to, which is the shape FPL publishes. A written-out
date stops demonstrating any of the five states the week after it passes.

### What the page carries

The union of LiveFPL's page and FPL's own, minus the duplicates: search, position filter,
club filter, all/risers/fallers/locked, sortable columns including the prediction, a progress bar, the projection, the
per-hour rate, ownership with its transfer trend, current price with the season's change,
lock and calibration markers, and paging with a page size.

Two things are ours rather than either site's: the **Omistajat** column, which names the
teams in this league that hold the player — the armband struck in the same lime as the
league table uses, a benched owner at half strength — and the **team filter**, which cuts
the six hundred rows down to one manager's fifteen.

**Locked** is a filter because FPL publishes it: `price_change_locked_until` is a
timestamp on 38 players at a time, so the page can both list them and say when each one
comes free.

The direction filter defaults to **all**, like FPL's own page. Splitting risers from
fallers is a filter, not a default: "what is moving" comes before "which way".

### Sorting the prediction

`outlookRank()` returns **one signed number**: rising soonest at the top, falling soonest
at the bottom, and nothing much happening in the middle. It is the progress column's own
rule applied to a different quantity.

    1350–2000  a named change, later nights lower, ties broken by how far past the line
                 the projection lands — two players changing the same night are not
                 equally sure of it
      295–300  near enough to hedge
         1–96  going nowhere this week, by how near the line it still gets
            0  locked or calibrating

The tiers are spaced so none can reach into the next, and the whole thing is multiplied by
the direction. Ranking by *when* alone was built first and is wrong for the same reason
ranking progress by distance from nothing was: it put *Nousee tänään* and *Laskee tänään*
at the same height, so the two rows you most want at the ends of the sort sat interleaved
in one block and both ends of the column held the same calm rows.

**Locked is the midpoint**, at exactly zero, and calibrating sits with it. Neither has a
direction, so neither belongs at either end. On 25 Aug the 610 rows came out as 4 rising
tonight, 3 tomorrow, 3 the night after, 4 hedged up, then the *Tuskin* rows thinning toward
zero, the 41 locked ones at 131–171, and the whole thing mirrored back out to 2 falling
tonight at the bottom.

Because it is signed it needs no special case in the header: like every other column here
it opens descending, on its largest value, which is the soonest rise.

Changing the sort now returns to page one, which it did not before. A re-order means page 4
holds different players than the page 4 you were looking at, and this sort moves every row
at once.

The progress sort is on the **signed** number, plus to minus, and nothing about the filter
changes that. Ranking by distance from nothing was tried and is wrong — it interleaves
risers and fallers, and a −57 landing above a +55 reads as no order at all. Flipping the
sign for the fallers filter was wrong for the same reason: a header sorts its column, and
the column has to mean one thing.

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

#### The article feed

The fourth pill on `#/uutiset`. RSS from a whitelist of two, not a news API over the whole
internet: a search for "Fantasy Premier League" returns every tabloid that has noticed the
phrase, and the free tiers of NewsAPI and GNews run 12–24 hours behind, which for a Friday
deadline is worthless.

**Eleven candidate feeds were tested on 26 Aug 2026 and two are alive.** Fantasy Football
Scout's own `/feed/` — 12 items, 18 kB, several a day, fresh within the hour — and
AllAboutFPL, at about one a week. The rest: `fantasyfootballfix.com` and `fplfocus.com`
answer 404, `planetfpl.com` does not respond, premierleague.com and the Guardian publish no
RSS at all, Reddit rate-limits a datacenter IP (429), and the tag feed every guide
recommends, `/tag/fantasy-premier-league/feed/`, returns an HTML page with no items in it.
The "30 FPL RSS sources" lists are aggregator marketing.

**The junk filter is the publisher's own categories**, which is why this costs nothing:
Scout tags every post itself — `Team News`, `Scout Picks`, `Chip Strategy`, `Set Piece
Takers` — so the topic pills are real classification rather than keyword guessing. The
lowercase entries in the same list are SEO tags, six a post, and are ignored. Anything
unmapped keeps the article and shows no chip. On top of that: nothing older than seven days,
at most five per source per day so one masthead cannot fill a page, and dedupe by link.

Only the headline, the lead sentence and a link out are stored. WordPress ends every excerpt
with "The post X appeared first on Y", which is a back-link rather than a summary and is
stripped; AllAboutFPL puts its whole article in the feed — 900 kB of it — and reprinting
that would be taking the piece rather than pointing at it. No images: neither feed carries
`media:content` or an `enclosure`, and fetching each page for an OG tag would be a dozen
requests to hotlink somebody else's picture.

The parser is fifty lines of regex over well-formed WordPress XML rather than a dependency —
Workers has no `DOMParser` — and it is tested against a real feed saved into
`worker/fixtures/`, entities, CDATA, tabs and all. The cron refreshes behind a twenty-minute
gate, so 19 ticks out of 20 cost one KV read; a tick where both feeds fail leaves what is
stored alone rather than wiping the page.

## Availability, and the flag FPL does not raise

`#/uutiset` is the third destination. It answers one question — who is not playing, and
whose squad is that a problem for — and the second half of it is the reason it exists.

### What FPL actually publishes

Every element carries `status`, `chance_of_playing_next_round`, `news` and `news_added`,
and 45 of them also carry `scout_news_link`, a link to the club's own word on it. Counted
against the live bootstrap on 26 Aug: `a` available (494), `i` injured (55), `u`
unavailable (41 — where a player who has left the league ends up), `d` doubtful (21), `s`
suspended (1). Chance is 0 for all of the first three and 75, 50 or 25 for a doubt.

**The badge carries its own three colours and does not use the theme's.** `--yellow` is
`#ffd34e` in the dark theme and `#a56800` in the light one, so a badge painted with it and
given dark text was dark-on-dark the moment the page was switched to light — which is how
this first shipped, and it was unreadable. A flag has to read the same in both themes and
over any club's shirt, so it is `#e8102f`, `#ff7a18` and `#ffd21e` with fixed ink, a
hairline to lift it off a white card and a shadow to lift it off a dark one, at 19px with
11px type rather than the 15px and 8px it started at.

FPL's own site paints a red or yellow corner on the shirt and puts the percentage in a
hover tooltip only. That is the wrong way round: **the colour says there is something to
read and the number is the thing you decide on**, so both are on the badge here — red with
a cross for out, yellow with the figure for a 75, amber for a 50 or 25, which is a
different decision and is not painted the same. The sentence stays on hover, verbatim from
FPL, because paraphrasing it would only add a second version to disagree with.

### The flag FPL does not raise

A player can be perfectly fit, unflagged, and not playing — out of favour, on the way out of
the club, third choice behind two fit keepers. **FPL's status only ever answers "can he
play", never "will he"**, so a manager holding Martinez at Villa sees a clean shirt every
week while the transfer talk runs and the team sheets come out without him.

**The first attempt at this was wrong and was removed the same day.** It counted starts —
no start in any of his club's games, while FPL said he was available — and it fails twice
over. A player can come off the bench every week and never start, which is how Rashford and
Šeško were both flagged for a weekend in which they both played; and what a player did last
Saturday says nothing about whether he is leaving. It was a number that could be computed
rather than a signal worth having, which is the wrong reason to build anything.

What answers it is somebody else's reporting. **FotMob's team payload carries an
`allRumours` list**, and each entry has the two clubs, the reported fee, the outlet that ran
it, a link to the report and a graded `probability` — `Imminent`, `High` or `Low`. That is a
judgement with a name on it rather than an inference of ours dressed up as data. Matched
onto FPL players it catches exactly the case that prompted it: Emiliano Martínez, Villa to
Chelsea, `Low`, The Sun, and both of the squads here that are starting him.

Three things were checked before choosing it. SofaScore's API answers 403 to anything
outside its own site, football-data.org needs a key for club data and carries no rumours at
all, and premierleague.com's own backend has no availability data. FotMob's league-level
transfer endpoint returns completed moves with no `probability`, so the rumours have to come
off the team payloads — 550 kB each — which is why the cron reads **half the league every
half hour** rather than all of it at once: a full refresh hourly, about 5 MB a tick, gentle
on somebody else's undocumented endpoint. The outlet is named on every row and the page
links to the report rather than restating it.

The matching is the fiddly part, because no two sites spell anybody the same way. FotMob
says `Emiliano Martínez`; FPL files him as `Emiliano` / `Martínez Romero` with a web name of
`Martinez`, and there is a second Martínez at United. So the club decides first — a rumour
is always attached to one — and within the club the match is on shared name parts with the
forename breaking ties. Nothing matches across clubs, and an unmatched rumour is dropped
rather than guessed at.

**A rumour is not an FPL fact, and it had a page of its own for one day too long.** It began
as a sortable table of its own — who is moving where, how strongly it is reported, and
whether he would still be in the Premier League afterwards. That last column was the tell:
staying in the league is no promise that anybody is playing on Saturday, which is the only
question this page exists to answer. A move matters here for exactly one reason — **a player
being negotiated over may not be in the side** — and that is the same thing the injury rows
above it are saying.

So the table is gone and the reports are folded into the list: a player nobody has flagged
but somebody has linked with a move gets a `⇄` row reading *Siirtohuhu — ei välttämättä
pelaamassa*, and a player who already has a flag gets the move as an extra line under it.
They rank below FPL's own doubts and above the players with nothing said about them.

**Every outlet is named and every report is linked.** One player collects several — Martínez
has Chelsea from The Sun and Juventus from Football Italia, Grealish had five in a day — so
the destinations are listed together and each source keeps its own link. **The grading is
not printed at all.** `Imminent` against `High` is somebody's interpretation, and two named
reports tell a reader more than one adjective does. It still does its work out of sight: it
decides whether a shirt is marked, since a `Low` is a newspaper having a guess and a shirt
has room for one mark.

### The half FPL cannot tell you

Every row carries which of these seven squads hold the player. Not whether he is in their
eleven: that was painted apart at first and it was noise, because whose squads he is in is
the question this column answers, and a benched player is held exactly as much as a
starting one. The armband stayed, since a doubtful captain is the one case where the
gameweek and the ownership are the same question. That is the whole reason for the page
rather than a link to FPL's own list:
118 flagged players is a fact, and "two of these seven are starting a 3 %-owned keeper who
has not played a minute" is a problem. The default filter is this league's exposure; the
whole game is one click away.

### Predicted elevens, and the injured-and-suspended list

Two more things FotMob publishes that FPL does not, and the first of them comes with a trap.

**The window was measured, not assumed.** A day and a half was tried first, on the
reasoning that a prediction appears an hour or two before kick-off, and it found nothing:
FotMob already had a predicted eleven for Friday's Palace v Man City on the Wednesday
afternoon, fifty-one hours out. It now asks about four days, and the dates come from FPL's
own fixture list rather than by walking the calendar — FotMob's date listing is every match
in the world that day, a third of a megabyte, so probing five days to find the three with
football in them wastes most of a megabyte on empty Tuesdays.

**A predicted eleven is only sometimes a prediction.** FotMob shows a starting eleven for
every upcoming match, but for the ones further out it is simply the side that started last
time. The payload says which is which in `content.lineup.lineupType`: `predicted` for the
real thing, `lastStarting11` for the stand-in. Checked across a full round on 26 Aug 2026,
the Friday night match and the two early Saturday kick-offs read `predicted` and the six
later ones read `lastStarting11` — exactly what FotMob's own site shows. **A
`lastStarting11` eleven is thrown away in the Worker and never reaches the page**, because a
caveat printed under eleven names is not read, and a rotated player shown as an expected
starter is worse than no eleven at all.

That makes the mark it produces honest: `XI` in grey on a shirt means *his club's eleven has
been predicted and he is not in it*. It says nothing at all until an hour or two before
kick-off, and a club with no prediction yet leaves its players unmarked rather than marked
wrong. It is the softest of the four shirt marks and the only one that can still be wrong by
kick-off, which is why it is the only grey one.

**The injured-and-suspended list comes from two places, and the nearer one wins.** The
club payload carries `overview.lastLineupStats.unavailable` — cheap, because the rumour pass
already fetches those ten payloads an hour, and it covers the whole league all week. The
match payload carries the same shape per fixture. They are not the same list: the club one
hangs off the last match played and the match one describes the side about to play. So the
broad list is the floor and the per-match list is laid over it where a fixture is close
enough to have one.

Either way it is richer than FPL's own flags — expected returns as phrases (`Early September
2026`, `Back in training`, `Doubtful`) and suspensions marked as suspensions — so a row on
the news page now carries FPL's word for *what is wrong* and FotMob's for *when he is back*,
each attributed, and a player FotMob has out while FPL still shows him clean gets a row and
an amber `!` of his own.

**Two heavy readers cannot share a tick.** A cron invocation has one budget for everything
in it, and the two FotMob passes are the expensive ones — ten club payloads at half a
megabyte for the rumours, a date listing and a handful of match pages for the elevens.
Landing both on the same minute put the invocation over its limit and it died before writing
anything, with no error to show for it: the line-up store simply sat empty. They now take
alternate minutes, on top of their own gates.

## Selling prices, and why a rise is worth half, 26 Aug

Select a squad in the team filter and every row it holds gains a **Myynti** line under the
price, struck with the highlighter when the change the page is predicting would actually
move it.

The rule is FPL's and it is not symmetric. Above what you paid you keep **half the profit,
rounded down to the nearest 0.1**; at or below it you sell for what he is worth now and take
the whole loss. `sellingPrice` in `services/fplRules.ts` is those two lines. The consequence
is the thing worth marking: a rise only lifts your selling price **every second time** — at
0.1 up you have banked nothing, at 0.2 you have banked 0.1 — and by the same halving, a fall
out of unbanked profit costs nothing either, since 0.5 up and 0.4 up both bank 0.2. So it is
not "rises are shared, falls are not": it alternates, and which half of the alternation a
player is on is not visible anywhere in FPL, which prints the selling price without the
parity behind it. `sellingPriceMoves` computes both sides rather than reasoning about the
parity, because that argument is easy to get right on paper and easy to get wrong in code.

**The purchase price is reconstructed, not read.** The public
`/entry/{id}/event/{gw}/picks/` carries no purchase price at all — only the manager's own
authenticated `my-team` endpoint does. But `/entry/{id}/transfers/` carries
`element_in_cost` for every player bought this season, and anyone still in a squad who was
never bought was in the original fifteen, whose price then is today's minus
`cost_change_start`. Transfers are walked oldest first so a player bought, sold and bought
again is worth what he cost last time, and free hit gameweeks are skipped: that squad is
handed back at the deadline, so what was paid during it was never paid.

The line only appears with a squad selected, because a selling price belongs to one manager
and one purchase — seven owners of the same player have seven different ones. `has-selling`
on the table then moves 36px from the owners column to the price column, which is the
column you need least once you have already picked whose squad this is.

**A fall that reaches the selling price is the one worth warning about**, and the warning is
the figure itself: the line switches to the price the squad will get back *after* tonight,
rather than printing the current one and leaving the reader to work the change out. It takes
a triangle, the highlighter and two extra points of size, because it is the only line in the
cell that is about to stop being true. A rise reaching the selling price is the same
arithmetic going the other way, so it is marked in green and not shouted at; the last column
is sized for the warning rather than for the price it replaces, since a triangle and a
£15.5m selling price is the widest thing it ever holds.

### Tonight's projection as its own column, 26 Aug

The prediction split in two. **Ennuste tänään** is the figure — where the player's rate has
him standing when tonight's change is decided — and **Milloin** is the sentence that figure
produced. They were one column, and the sentence alone hid what it was read off: *Nousee
tänään* says nothing about whether he arrives at 104 % or 160 %, and that difference is
most of what a reader wants from the column.

The figure is `projectedAt(row, nextPriceDeadline(market, now), now)`, exported from
`services/priceChanges.ts` because the table now prints the same number it already sorted
by. It is read once per render for the whole table, so every row answers the same question
about the same moment, and it is not drawn at all for a locked player or when FPL's list of
deadlines has run out — there is then no tonight to project to. Checked against LiveFPL on
the same rows: 116.2 against 115.75, 105.9 against 105.69, 104.9 against 104.51, 97.7
against 97.62. Same numbers, arrived at independently.

Past the line it is struck with `--pick`, the league's own highlighter — the same band the
picked captain's name gets, text on a stroke rather than in a pill, so a column of them does
not read as a column of buttons. It is deliberately not green or red: the sentence beside it
already says which way, and the two colours mean direction everywhere else on the page. The
figure crossing 100 does not mean *up*, it means *this has stopped being a projection*.

On a phone this column takes the per-hour column's place. It is the same rate read at the
moment it settles, which is the question a phone is being asked; the four columns that
survive are now who, how far along, where tonight leaves him, and what he costs.

### The price change history, 26 Aug

The price page has two tabs. **Ennuste** is everything above: where prices are going.
**Historia** is what they have already done, and it is the site's own record rather than
FPL's, because FPL does not keep one.

That is the whole design constraint. `now_cost` and `cost_change_start` are totals: after
02:00 a player simply costs a tenth more than he did, with nothing anywhere saying when he
moved or from what. `element-summary` carries a `value` per gameweek, which is a price on a
Saturday and not a change on a Tuesday, and it costs one request per player to read. So the
log is built the way every price history on the internet is built, LiveFPL's included — by
diffing successive snapshots and stamping the time itself. **It has no past before the night
the Worker started watching**, there is nothing to backfill it from, and the page says so
under the table rather than letting a quiet fortnight read as a fortnight in which nothing
happened.

`worker/priceHistory.ts` keeps one KV value: a snapshot of every `now_cost`, the log itself,
and `checkAfter` — the moment it is next worth fetching anything. Prices move once a day at
a time FPL publishes, so this does not poll the way the event feed does: on all but a few
ticks a day it returns after one KV read and no fetch at all.

Two details are what keep it inside the free plan's thousand writes:

- **The window is measured from the deadlines that have passed, not the ones ahead.** FPL
  drops a spent deadline from `price_change_deadlines`, so by the time the prices actually
  move, tonight's entry is already gone from the list — a window measured off the next
  entry would open at the wrong end of the day and never see a change.
- **Inside the window the gate is the deadline itself, not the clock.** A clock reading
  would differ every minute, so every quiet tick of a two-hour window would write a new
  `checkAfter` to say nothing had happened: 120 writes a night. Held at the deadline that
  opened the window, a night in which nothing moved writes nothing at all.

A change's id is `element:date:newPrice`, so a replayed tick cannot log the same move twice;
a player missing from the snapshot is seeded in silence, because a price the log has never
seen cannot be said to have moved. The log keeps 31 days.

At the page end the two tabs are deliberately the same table read twice — the same shirt
column, the same owners, the same filter row above both, with only the middle columns
swapped. The filters live in `PriceChanges` and are handed down as one `matches` predicate
so that switching tabs keeps the selection instead of quietly widening it back out.
*Lukitut* is dropped on the history tab: locked describes a price that cannot move yet,
which has nothing to say about one that already has.

Nights are grouped by the night they belong to, not by the date on the stamp. `nightOf`
winds the moment back twelve hours before reading the date off it, so anything in the small
hours belongs to the evening before — which is what every manager and LiveFPL's own page
call it, and it is the same reckoning `daysUntilChangeDay` uses for a deadline, read from
the other side. The most recent night is therefore labelled *Viime yönä* rather than
*Eilen*. Within a night, risers before fallers and ownership descending: every change is
exactly a tenth, so ownership is the only thing that separates them.

**The night of 25 Aug is seeded in code** (`SEEDED_CHANGES` in `worker/priceHistory.ts`).
It was the season's first price change and the only one before any of this existed:
M.Sangaré and De Cuyper +0.1, Gyökeres and Martinelli −0.1, read off LiveFPL and checked
against FPL — all four have a `cost_change_start` of exactly ±1, which is only true if
these moves are the whole of their season. It is merged at read time rather than written to
KV, so it cannot be lost with the value or duplicated by it; a watched line with the same id
wins. The stamp is FPL's window rather than a minute anybody recorded and the ownership is
today's, and nothing else will ever be seeded — there is no source outside the log for any
night after it.

FPL's published deadline is 23:00Z and the prices themselves land somewhere around
00:30–01:30Z, an hour or more later, which is why the window is four hours rather than the
two it started as. It also closes early: the night's change happens once, so the tick that
sees it sets the gate straight to the next deadline instead of fetching every minute until
the window times out.

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

Cron runs every minute.

| Trigger | Message |
| --- | --- |
| 24h and 2h before deadline | Text reminder with link button |
| Picks published after deadline | The deadline card, alone, with the link button and no caption |
| The last fixture reaches full time | Two messages, see below |
| `/farmisarja` | Link message |
| `/deadline` | Time to next deadline |
| `/id` | Answers with the id of the chat it was sent in |
| `/kortit` | Queues the post-gameweek report to the asker, as a preview |

The post-gameweek report is **two messages**: first the gameweek card alone with the
FARMISARJA LIVE button, then the standings and awards as a pair with no caption, no
link and nothing else. Telegram allows an inline keyboard on a single photo but not on
an album, which is why it is split.

It is queued the moment FPL calls the last match, with no wait of its own. Ten minutes used
to sit here to let the bonus settle; watching GW1 out showed nothing to wait for, since a
finished match's bonus did not move while the last one was still running. Queueing is not
sending either — the album still takes a card per tick, so minutes pass regardless.

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
  is full time; `finished` is the confirmed result. Bonus being published is *not* a signal
  that a result is settled any more.
- **`is_current` stays on a finished gameweek.** It was still on GW1 on 25 Aug with every
  GW1 fixture confirmed and GW2 four days out, so nothing that should follow the *live*
  gameweek may key off it alone — see the header handover above.
- **A gameweek is confirmed all at once, at 09:00 UK the morning after its last match**,
  which is new for 2026-27 — `finished` flips on every fixture together rather than
  trickling in. `event.data_checked` does **not** follow at the same moment: at 11:13 on
  25 Aug every GW1 fixture read `finished: true` while the event still read
  `data_checked: false`, and FPL's own page had already moved on. So `pointsFinalized` is
  `data_checked` **or every fixture of the gameweek confirmed**, which is the thing the
  label actually claims — a gameweek whose fixtures are all confirmed cannot have its
  points change. `data_checked` is still trusted when set, so the state can settle earlier
  and never regress.
- **`last_rank` is 0 when there is no previous rank**, and overall rank is reported as
  1 for everyone before anything is scored. Both must be hidden rather than drawn.
- Around the deadline FPL answers 5xx and picks return a mix of 404 and 503. That is
  normal and must render as the waiting view, not an error.

## Open tasks

The first three of these were done on the evening of 24 Aug, during GW1's last match. The
Worker is deployed, the ticker filled with real events, and the automatic Telegram report
arrived with all three cards correct.

1. **Verify the deadline card's totals and transfer lines against real picks.** The card
   was rendered from real GW1 picks on 23 Aug and is in
   `artifacts/cards/deadline-real.png`: real names, real captains, ordered by
   `manager.position`. Two parts of it are still unseen, because GW1 cannot show them —
   the settled total, which is hidden at GW1 where it is zero, and an actual `out → in`
   list, since nobody had transfers before the first deadline. **GW2's deadline is 28 Aug
   at 20:30**, and it is the first time both appear.
2. **Watch a gameweek's first match with the pre-kick-off baseline in place.** GW1 could
   not test it: the Worker was deployed mid-gameweek, so the first match it ever saw was
   already in progress. `feed:gw:2` starts empty, a baseline should be written in the
   twelve minutes before the first kick-off, and the opening minutes should appear. If they
   do not, `npx wrangler tail --format json` and look for `feed_events_added` and
   `feed_update_error`. The log is pretty-printed multi-line JSON, so split on `
{`.
3. **Watch the write budget now the cron ticks every minute.** A heavy Saturday was
   measured at about 200 writes at two minutes a tick and should be about 400 at one,
   against the free plan's 1,000 a day. GW1 was a light test of this — one live match.
4. **Watch the live rank through a gameweek that is actually running.** Deployed 25 Aug and
   the GW1 sample built cleanly, but GW1 cannot show the feature: FPL had already reprocessed
   it, so every rank is exact and the estimate stands down. GW2's first kick-off is the first
   time FPL's figure freezes and ours has to carry it. Watch that the tildes appear, that the
   ranks move with the ticker rather than lagging it, and that they stand down again when FPL
   reprocesses on the Tuesday. `npx wrangler tail --format json` for `rank_sample_error`,
   `rank_page_error` and `rank_picks_error` — the last two are per-item and tolerated, the
   first is not. The GW2 sample builds itself after Friday's 20:30 deadline; check it has
   completed before Saturday.
5. **Watch what 848 requests a gameweek does to FPL's patience.** Twenty a minute for
   45 minutes, once a week. Nothing suggested a limit on 25 Aug, but the sample was also
   built on a quiet Tuesday afternoon rather than an hour before kick-off.
6. **Eighth manager.** `round-8.webp`, `total-8.webp` and `deadline-8.webp` are ready.
   Nothing else needs changing; the card picks the plate by row count.
7. **`feed:gw:1` carries about twenty stray bonus lines.** `repairEvents` wound every
   player's stored bonus back to the last one reported, including players whose match had
   long finished and whose bonus had never been reported at all, so one tick emitted a
   `0 → N` line for each of them. Harmless, invisible from GW2 on, and left alone
   deliberately: the fix belongs in the next repair version if it is ever worth one.

Nothing is half-built. The working tree is clean, everything is pushed, the Worker is
deployed, and the four checks — `npm test` (56 passing), `npm run build`,
`npm run worker:check` and `node scripts/check-overflow.mjs` (28 widths and 14 picker
menus) — all pass as of the last commit.

## What the first live gameweek corrected, 24 Aug

The ticker's first real test. Everything below was wrong in a way no amount of demo data
could have shown, and each was found by reading the Worker's log or the live API rather
than by looking at the page.

- **Defensive contribution flooded the feed.** Thirteen of the fourteen events stored that
  evening were sub-threshold defcon at a points delta of zero. The counter is raw CBIT, not
  a score. It now fires where the two points land.
- **A goal in the first minute never appeared.** No snapshot existed when the match kicked
  off, so it went into the baseline. Hence the pre-kick-off baseline.
- **Every line showed the player's whole gain on the tick**, so a goal and the bonus beside
  it both read +8. `explain` prices each stat; the feed stores it.
- **A bonus fall emitted nothing**, so two players stood at three bonus at once.
- **Editing the KV value by hand does not hold.** The cron reads the key, appends to what it
  read and writes the whole thing back, so a hand-edit is gone within a tick. Three attempts
  went that way before the repair was moved inside the cron where it belongs.

One thing that looked like a finding was not: a burst of bonus lines from long-finished
matches, which read as FPL recalculating hours later. It was `repairEvents` re-emitting
them. Check what your own repair did before drawing a conclusion from the data it wrote.

## What was built on 24 Aug

The price change page, the live ticker and a long pass over the squad panel. Each has its
own section above; what is worth knowing in one place is that **three separate features
turned out to be reading FPL's own published numbers rather than modelling anything** —
price progress, the gameweek average behind the form figure, and fixture difficulty. The
one thing that genuinely had to be derived is the event feed, because FPL publishes state
and not events.

Four bugs were found by measurement rather than by eye, and all four had the same shape —
a number compared against a stale copy of itself:

- **autosubs were shown but not counted**, so a substitute's points were missing from the
  total. Measured: 54 against LiveFPL's 56.
- **overall-rank movement was drawn against this gameweek's stored rank** when there was no
  previous gameweek, so a green pill appeared or did not depending on which of two numbers
  FPL had refreshed last.
- **the form series was built from the stored gameweek points**, which do not update during
  live matches, so form disagreed with the GW column beside it all weekend.
- **the table clipped its last columns** between 801 and 1259px, and again at 1280 before
  that, because the row asked for more width than `.league-table` gave it and the overflow
  was hidden rather than shown.

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
  missing for weeks. Nor can it see an absolutely positioned overlay painting outside
  itself, which is why the picker menu has a containment check of its own beside this one. Chrome's `--screenshot` flag does not size the viewport reliably
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
