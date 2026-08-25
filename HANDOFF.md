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
| `src/PriceChanges.tsx` | The price change page at `#/hinnat` |
| `src/Ticker.tsx` | The live event ticker under the header |
| `src/services/liveFeed.ts` | Reads the event log from the Worker |
| `worker/events.ts` | Derives the events by diffing snapshots, and serves `/events` |
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
club filter, all/risers/fallers/locked, sortable columns, a progress bar, the projection, the
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
  is full time; `finished` is the confirmed result and can lag for many hours. Bonus
  being published is *not* a signal that a result is settled any more.
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
4. **Eighth manager.** `round-8.webp`, `total-8.webp` and `deadline-8.webp` are ready.
   Nothing else needs changing; the card picks the plate by row count.
5. **`feed:gw:1` carries about twenty stray bonus lines.** `repairEvents` wound every
   player's stored bonus back to the last one reported, including players whose match had
   long finished and whose bonus had never been reported at all, so one tick emitted a
   `0 → N` line for each of them. Harmless, invisible from GW2 on, and left alone
   deliberately: the fix belongs in the next repair version if it is ever worth one.

Nothing is half-built. The working tree is clean, everything is pushed, and the four
checks — `npm test` (31 passing), `npm run build`, `npm run worker:check` and
`node scripts/check-overflow.mjs` (28 widths and 14 picker menus) — all pass as of the
last commit.

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
