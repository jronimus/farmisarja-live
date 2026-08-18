# FPL data map

Verified against the official FPL endpoints on 18 August 2026, before the 2026/27 Gameweek 1 deadline.

## Official endpoints

| Feature | Endpoint | Notes |
| --- | --- | --- |
| Events, deadlines, players, clubs, positions and chips | `/api/bootstrap-static/` | Cache for several minutes. Chip availability is season data and must not be assumed from previous seasons. |
| Fixtures and match state | `/api/fixtures/` | Includes event, kickoff, started, finished, provisional finish and fixture stats. |
| Live player scoring | `/api/event/{event}/live/` | `elements[].stats` contains current scoring and `bonus`; `explain` identifies fixture-level scoring components. The endpoint is empty before the event data opens. |
| Mini-league standings | `/api/leagues-classic/{leagueId}/standings/` | Paginated entries, current rank, previous rank and season total. |
| Manager metadata | `/api/entry/{entryId}/` | Team name, manager, overall points and finalized overall rank. |
| Picks, multipliers and active chip | `/api/entry/{entryId}/event/{event}/picks/` | Becomes available after the deadline at a variable time. Availability must be checked per manager. |
| Manager gameweek history | `/api/entry/{entryId}/history/` | Finalized event rows and chip history. |
| Transfers | `/api/entry/{entryId}/transfers/` | Filter by event; pair incoming and outgoing elements by transfer time/order. |

## Derived values

- Provisional bonus: show normal points and the live `bonus` component separately. Confirm during an active fixture whether `total_points` already includes the current provisional bonus before combining values; never add it twice.
- Captain contribution: live player total multiplied by the picks multiplier. Triple Captain is represented by multiplier 3.
- Transfer cost: use the manager event summary/history cost when available. Do not infer a hit only from transfer count because saved free transfers vary.
- Finished/live/to play: join selected players to their event fixtures and fixture state. Count players, not captain multipliers.
- Form: persist finalized manager event scores and calculate a rolling five-event value.
- Monthly table: group finalized event scores by the event deadline month.

## Values that need calculation or persistence

- Live autosubs require appearance evidence, bench order, goalkeeper rules, valid formation constraints, Bench Boost handling and provisional captain fallback. They need dedicated rule tests.
- Exact live overall rank is not exposed by the documented public endpoints. Until a verified rank distribution calculation exists, the UI must label it as estimated; the finalized entry rank must not be presented as live.
- Previous live states, selected-event squads and Telegram idempotency keys must be stored locally because old live API state is not a historical archive.
- Post-deadline readiness is true only after valid picks are available for every league entry. A timer after the deadline is insufficient.
- End-of-event automation must use every fixture in the event and wait until all report a finished state, then apply the configured grace period.

## Current risks

1. Validate `total_points` and live `bonus` interaction during the first active fixture.
2. Validate no-appearance detection and formation-safe autosubs against official processing.
3. Treat live overall rank as an estimate until a reproducible calculation is verified.
4. Add retry/backoff for incomplete post-deadline picks and temporary FPL failures.
5. Generate Pages snapshots outside the browser because direct cross-origin FPL requests are blocked.
