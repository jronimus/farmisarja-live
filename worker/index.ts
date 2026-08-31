import { captureCard, handleTelegramWebhook, runDeadlineReminders, runTelegramJobs, type ShareCardKind, type TelegramEnv } from "./telegram";
import { readCatalog, refreshCatalog, refreshDue, type Catalog, type CatalogEnv } from "./catalog";
import { BEAT_EVERY, beatAge, checkHeartbeat, writeHeartbeat, type HealthEnv } from "./health";
import { advanceSample, computeCurve, type LiveRankEnv } from "./liveRank";
import { readFeed, updateFeed, type EventsEnv } from "./events";
import { allChanges, readHistory, updatePriceHistory, type PriceHistoryEnv } from "./priceHistory";
import { readArticles, updateArticles, type ArticlesEnv } from "./articles";
import { readRumours, updateRumours, type RumoursEnv } from "./rumours";
import { readLineups, updateLineups, type LineupsEnv } from "./lineups";
import { readDeals, updateTransfers, type TransfersEnv } from "./transfers";
import { figuresFor, readCursor, updateFplHistory, type FplHistoryEnv } from "./fplHistory";
import { readAppearances, updateAppearances, type AppearancesEnv } from "./appearances";
import { readInsights, seasonTotals, updateInsights, type InsightsEnv } from "./insights";

const CARD_KINDS: ShareCardKind[] = ["round", "total", "awards", "deadline"];

const FPL_ORIGIN = "https://fantasy.premierleague.com";

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  /**
   * The published site, and a development machine.
   *
   * A phone on the same wifi reaches the dev server by its LAN address, not by `localhost`,
   * so a check that only knew the loopback names answered every fetch from a phone with a
   * CORS failure — the page drew its header, its footer and nothing in between. Private
   * ranges are allowed for that reason: they are unroutable from the internet, so this
   * widens the door only to machines already inside the same house.
   */
  const allowed = origin === env.ALLOWED_ORIGIN
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    || /^https?:\/\/(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body: unknown, request: Request, env: Env, status = 200): Response {
  return Response.json(body, { status, headers: { ...corsHeaders(request, env), "Cache-Control": "no-store" } });
}

function upstreamPath(pathname: string, env: Env): { path: string; ttl: number } | null {
  if (pathname === "/api/bootstrap-static") return { path: "/api/bootstrap-static/", ttl: 300 };
  if (pathname === "/api/fixtures") return { path: "/api/fixtures/", ttl: 30 };
  if (pathname === "/api/league") return { path: `/api/leagues-classic/${env.FPL_LEAGUE_ID}/standings/?page_standings=1&page_new_entries=1`, ttl: 30 };
  const live = pathname.match(/^\/api\/event\/(\d+)\/live$/);
  if (live) return { path: `/api/event/${live[1]}/live/`, ttl: 30 };
  const entry = pathname.match(/^\/api\/entry\/(\d+)$/);
  if (entry) return { path: `/api/entry/${entry[1]}/`, ttl: 30 };
  const history = pathname.match(/^\/api\/entry\/(\d+)\/history$/);
  if (history) return { path: `/api/entry/${history[1]}/history/`, ttl: 30 };
  const transfers = pathname.match(/^\/api\/entry\/(\d+)\/transfers$/);
  if (transfers) return { path: `/api/entry/${transfers[1]}/transfers/`, ttl: 30 };
  const picks = pathname.match(/^\/api\/entry\/(\d+)\/event\/(\d+)\/picks$/);
  if (picks) return { path: `/api/entry/${picks[1]}/event/${picks[2]}/picks/`, ttl: 30 };
  return null;
}

async function proxy(request: Request, env: Env, path: string, ttl: number): Promise<Response> {
  const upstream = await fetch(`${FPL_ORIGIN}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: ttl },
  });
  const headers = new Headers(corsHeaders(request, env));
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json; charset=utf-8");
  headers.set("Cache-Control", `public, max-age=${ttl}`);
  headers.set("X-Farmisarja-Cache-Ttl", String(ttl));
  return new Response(upstream.body, { status: upstream.status, headers });
}


/**
 * The background jobs, one per odd minute, in the order they take their turn.
 *
 * Each already returns after a single KV read on a turn it is not due — the `checkAfter`
 * gate every one of them keeps — so a turn spent on a job with nothing to do is cheap. What
 * the rotation buys is the guarantee that two of them can never land on the same tick, which
 * is how a quiet Tuesday could still put four bootstrap parses into one invocation.
 *
 * Telegram appears four times because it is the one with something to do most often: a card
 * of an album per turn, and the deadline card to notice. Its turn comes round every eight
 * minutes or so; everything else waits about half an hour, which is well inside its own gate.
 */
const ROTATION: Array<{ name: string; run: (env: Env, catalog: Catalog, now: number) => Promise<unknown> }> = [
  { name: "telegram", run: (env, catalog, now) => runTelegramJobs(env as TelegramEnv, catalog.events, now) },
  { name: "transfers", run: (env, _catalog, now) => updateTransfers(env as TransfersEnv, now) },
  { name: "rank", run: (env, catalog, now) => advanceSample(env as LiveRankEnv, catalog, now) },
  { name: "telegram", run: (env, catalog, now) => runTelegramJobs(env as TelegramEnv, catalog.events, now) },
  { name: "lineups", run: (env, _catalog, now) => updateLineups(env as LineupsEnv, now) },
  { name: "articles", run: (env, _catalog, now) => updateArticles(env as ArticlesEnv, now) },
  { name: "telegram", run: (env, catalog, now) => runTelegramJobs(env as TelegramEnv, catalog.events, now) },
  { name: "rumours", run: (env, _catalog, now) => updateRumours(env as RumoursEnv, now) },
  { name: "prices", run: (env, _catalog, now) => updatePriceHistory(env as PriceHistoryEnv, now) },
  { name: "telegram", run: (env, catalog, now) => runTelegramJobs(env as TelegramEnv, catalog.events, now) },
  { name: "appearances", run: (env, _catalog, now) => updateAppearances(env as AppearancesEnv, now) },
  { name: "history", run: (env, _catalog, now) => updateFplHistory(env as FplHistoryEnv, now) },
  { name: "telegram", run: (env, catalog, now) => runTelegramJobs(env as TelegramEnv, catalog.events, now) },
  { name: "insights", run: (env, _catalog, now) => updateInsights(env as InsightsEnv, now) },
];

/**
 * The three hours after a deadline, when the rank sample has a hundred and twenty pages to
 * read and a reason to hurry.
 *
 * It needs about fifty turns to finish and takes them at twenty requests each; a turn every
 * half hour from the rotation would have it still reading on Saturday evening. So for one
 * window a week it takes every odd minute instead, and outside that window it goes back to
 * the rotation like everything else — which is enough to finish a sample that some outage
 * left half-read.
 */
function rankHasPriority(catalog: Catalog, now: number): boolean {
  const current = catalog.events.find((event) => event.is_current);
  if (!current) return false;
  const deadline = Date.parse(current.deadline_time);
  return now >= deadline && now < deadline + 3 * 3_600_000;
}

/** A failure costs its own stage and nothing below it. */
async function stage(name: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(JSON.stringify({ event: "tick_stage_error", stage: name, error: error instanceof Error ? error.message : String(error) }));
  }
}

async function tick(env: Env, scheduledTime: number): Promise<void> {
  const now = scheduledTime;
  const minute = new Date(now).getUTCMinutes();

  // Before anything that could kill the invocation, so an outage is reported by the ticks
  // that are still dying rather than by the first one that recovers.
  await stage("watchdog", () => checkHeartbeat(env as HealthEnv, now));

  const catalog = await readCatalog(env as CatalogEnv);
  // The cheapest thing on the tick and the one with a deadline of its own.
  if (catalog) await stage("reminders", () => runDeadlineReminders(env as TelegramEnv, catalog.events, now));

  // One heavy job, and only one. A stale catalog outranks the rest: everything above reads
  // it, and until it exists there is nothing for the feed or the reminders to work from.
  if (refreshDue(catalog, now)) {
    await stage("catalog", () => refreshCatalog(env as CatalogEnv, now));
  } else if (catalog && minute % 2 === 0) {
    // The feed on even minutes, which is the two-minute cadence it was always documented to
    // have — it used to attempt every minute and land on whichever ticks happened to survive.
    await stage("feed", () => updateFeed(env as EventsEnv, catalog, now));
  } else if (catalog && rankHasPriority(catalog, now)) {
    await stage("rank", () => advanceSample(env as LiveRankEnv, catalog, now));
  } else if (catalog) {
    const job = ROTATION[Math.floor(minute / 2) % ROTATION.length];
    await stage(job.name, () => job.run(env, catalog, now));
  }

  // Last, and only from a tick that got this far.
  if (minute % BEAT_EVERY === 0) await stage("heartbeat", () => writeHeartbeat(env as HealthEnv, now));
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/telegram/webhook") return handleTelegramWebhook(request, env as TelegramEnv, ctx);
    if (request.method === "GET" && url.pathname === "/admin/card-screenshot") {
      const telegramEnv = env as TelegramEnv;
      if (!telegramEnv.SCREENSHOT_PREVIEW_SECRET || request.headers.get("Authorization") !== `Bearer ${telegramEnv.SCREENSHOT_PREVIEW_SECRET}`) return new Response("Unauthorized", { status: 401 });
      const kind = CARD_KINDS.find((candidate) => candidate === url.searchParams.get("card"));
      if (!kind) return json({ error: `card must be one of ${CARD_KINDS.join(", ")}` }, request, env, 400);
      try {
        const screenshot = await captureCard(telegramEnv, kind);
        return new Response(screenshot, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, request, env, 502);
      }
    }
    if (request.method !== "GET") return json({ error: "Method not allowed" }, request, env, 405);
    if (url.pathname === "/health") {
      // How long since a tick last reached its end. This is the outage of 28-30 August made
      // askable: it ran for three days behind a route that answered `ok: true` throughout,
      // because nothing here knew whether the cron was alive.
      const age = await beatAge(env as HealthEnv);
      return json({
        ok: true,
        leagueId: env.FPL_LEAGUE_ID,
        cron: age === null ? "no beat yet" : { lastTickMinutesAgo: Math.round(age / 60_000), stalled: age >= 25 * 60_000 },
      }, request, env);
    }
    if (url.pathname === "/rank") {
      const gameweek = Number(url.searchParams.get("gw"));
      if (!Number.isInteger(gameweek) || gameweek < 1) return json({ error: "gw is required" }, request, env, 400);
      const curve = await computeCurve(env as LiveRankEnv, gameweek);
      if (!curve) return json({ error: "no rank sample yet" }, request, env, 404);
      // A minute of cache is what bounds the cost of computing this per request: the work
      // happens once a minute however many people are watching, and not at all when nobody
      // is. It is also finer than the page's own ninety-second poll.
      return new Response(JSON.stringify(curve), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" },
      });
    }
    if (url.pathname === "/events") {
      const gameweek = Number(url.searchParams.get("gw"));
      if (!Number.isInteger(gameweek) || gameweek < 1) return json({ error: "gw is required" }, request, env, 400);
      const feed = await readFeed(env as EventsEnv, gameweek);
      // The cron writes at most every two minutes, and the cache is what keeps a page left
      // open all evening off the KV read budget: the Worker is asked about four times a
      // minute however many people are watching. Fifteen seconds rather than thirty because
      // it was half a minute of the ticker's own lateness, and the reads it costs are
      // bounded by the cache rather than by the audience.
      return new Response(JSON.stringify({ gameweek, events: feed?.events ?? [] }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=15" },
      });
    }
    if (url.pathname === "/price-history") {
      const history = await readHistory(env as PriceHistoryEnv);
      // Prices move once a night, so a page left open all evening has nothing to gain from
      // asking again soon. Ten minutes is short enough that the morning after a change the
      // reader is never far behind it.
      return new Response(JSON.stringify({ changes: allChanges(history) }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" },
      });
    }
    if (url.pathname === "/articles") {
      const stored = await readArticles(env as ArticlesEnv);
      // The cron refreshes these every twenty minutes, so five is well inside the window
      // and keeps a page left open on a phone off the KV read budget.
      return new Response(JSON.stringify({ articles: stored?.articles ?? [], pressers: stored?.pressers ?? [], pressersFor: stored?.pressersFor ?? 0 }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }
    if (url.pathname === "/rumours") {
      const stored = await readRumours(env as RumoursEnv);
      // The done deals ride along on the same response: the page asks one question — what
      // is going on with this player — and it should not take two requests to answer.
      const deals = await readDeals(env as TransfersEnv);
      // When each player last played, which is what settles a report that nobody retracts.
      const seen = await readAppearances(env as AppearancesEnv);
      return new Response(JSON.stringify({
        rumours: stored?.rumours ?? [],
        absences: stored?.absences ?? [],
        deals: deals?.deals ?? [],
        lastPlayedAt: seen?.lastPlayedAt ?? {},
        lastFixtureAt: seen?.lastFixtureAt ?? {},
      }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }
    if (url.pathname === "/lineups") {
      const stored = await readLineups(env as LineupsEnv);
      return new Response(JSON.stringify({ fixtures: stored?.fixtures ?? [] }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=180" },
      });
    }
    if (url.pathname === "/insights") {
      const stored = await readInsights(env as InsightsEnv);
      // Summed here rather than in the browser: the store is per gameweek so a finished one
      // is never fetched twice, and the page asks for either the season or one week of it.
      // `?gw=` takes a list, because the page lets a reader pick any set of gameweeks —
      // three of them in a row is a form guide, and one is a match report.
      const wanted = (url.searchParams.get("gw") ?? "")
        .split(",").map(Number).filter((week) => Number.isInteger(week) && week > 0);
      const picked = wanted.length
        ? Object.fromEntries(wanted.map((week) => [week, stored?.byGameweek[week] ?? []]))
        : stored?.byGameweek ?? {};
      return new Response(JSON.stringify({
        gameweek: wanted.length === 1 ? wanted[0] : stored?.current ?? 0,
        gameweeks: Object.keys(stored?.byGameweek ?? {}).map(Number).sort((a, b) => a - b),
        players: stored ? seasonTotals(picked) : [],
      }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=180" },
      });
    }
    if (url.pathname === "/fpl-stats") {
      // `?gw=` takes a list, the same way `/insights` does, and for the same reason: a
      // reader picks any set of gameweeks. With no list this answers only which gameweeks
      // can be asked for — the season is FPL's own bootstrap and does not come from here.
      const wanted = (url.searchParams.get("gw") ?? "")
        .split(",").map(Number).filter((week) => Number.isInteger(week) && week > 0);
      const cursor = await readCursor(env as FplHistoryEnv);
      const figures = wanted.length
        ? await figuresFor(env as FplHistoryEnv, wanted)
        : { fields: [], players: [], unavailable: [] };
      return new Response(JSON.stringify({ gameweeks: cursor?.taken ?? [], ...figures }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" },
      });
    }
    const route = upstreamPath(url.pathname, env);
    if (!route) return json({ error: "Not found" }, request, env, 404);
    try {
      return await proxy(request, env, route.path, route.ttl);
    } catch (error) {
      console.error(JSON.stringify({ event: "fpl_proxy_error", path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: "FPL service temporarily unavailable" }, request, env, 502);
    }
  },
  /**
   * One tick, one budget.
   *
   * A cron invocation on this plan has ten milliseconds of CPU, and the whole of 28–30
   * August was spent discovering what happens when the tick asks for more: Cloudflare kills
   * it where it stands, with no exception and no log, and whichever tasks had not finished
   * simply did not happen. Deadline reminders were never sent, the deadline card was
   * fourteen hours late and the ticker stopped mid-afternoon — one cause, three symptoms.
   *
   * So the tick is now ordered by what it can afford to lose, and it runs in sequence rather
   * than as a dozen parallel tasks racing each other through the same budget:
   *
   *   1. the watchdog and the reminders, which together cost a KV read and some arithmetic
   *      and therefore always happen;
   *   2. exactly one heavy job — the catalog when it is stale, the feed on even minutes,
   *      otherwise whichever background job the rotation has reached;
   *   3. the heartbeat, written last, because a mark of a finished tick has to be written
   *      by a tick that finished.
   *
   * Every stage is fenced on its own, so a failure costs its own stage and nothing below it.
   */
  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(tick(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
