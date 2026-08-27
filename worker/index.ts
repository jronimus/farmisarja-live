import { captureCard, handleTelegramWebhook, runTelegramSchedule, type ShareCardKind, type TelegramEnv } from "./telegram";
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
    if (url.pathname === "/health") return json({ ok: true, leagueId: env.FPL_LEAGUE_ID }, request, env);
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
      // The cron writes at most every two minutes, so a short cache costs the feed nothing
      // and keeps a page left open all evening off the KV read budget.
      return new Response(JSON.stringify({ gameweek, events: feed?.events ?? [] }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" },
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
  async scheduled(controller, env, ctx): Promise<void> {
    /**
     * The minute, used to keep the two heavy readers apart.
     *
     * A cron invocation has one budget for all of it, and the two FotMob passes are the
     * expensive ones — ten team payloads at half a megabyte each for the rumours, a date
     * listing and a handful of match pages for the line-ups. Landing both on the same tick
     * put the invocation over its limit and it died before writing anything, silently,
     * which is exactly how the line-up store sat empty with no error to show for it. They
     * now take alternate minutes; each still has its own gate on top of that.
     */
    const minute = new Date(controller.scheduledTime).getUTCMinutes();
    ctx.waitUntil(runTelegramSchedule(env as TelegramEnv));
    // Independent of the Telegram switch: the feed is the site's, not the chat's.
    ctx.waitUntil(updateFeed(env as EventsEnv).catch((error) => {
      console.error(JSON.stringify({ event: "feed_update_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // The sample is built once a gameweek; scoring it happens on request, not on a tick.
    // Guarded on its own, so a failure here leaves the feed and the reminders alone.
    ctx.waitUntil(advanceSample(env as LiveRankEnv).catch((error) => {
      console.error(JSON.stringify({ event: "rank_sample_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // Prices move once a day, and this returns after one KV read on every tick that is not
    // near a change. Guarded on its own like the rest.
    ctx.waitUntil(updatePriceHistory(env as PriceHistoryEnv).catch((error) => {
      console.error(JSON.stringify({ event: "price_history_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // Twenty minutes behind its own gate, so this is a KV read on 19 ticks out of 20.
    ctx.waitUntil(updateArticles(env as ArticlesEnv).catch((error) => {
      console.error(JSON.stringify({ event: "articles_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // Half the league every half hour, and a KV read on every other tick.
    if (minute % 2 === 0) ctx.waitUntil(updateRumours(env as RumoursEnv).catch((error) => {
      console.error(JSON.stringify({ event: "rumours_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // The transfer wire is 29 kB, so it can be read on every tick — it is the one source
    // here that is minutes old rather than an hour, and the gate inside it is five minutes.
    ctx.waitUntil(updateTransfers(env as TransfersEnv).catch((error) => {
      console.error(JSON.stringify({ event: "transfers_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // The fixtures close to kick-off, every quarter of an hour, on the odd minutes.
    if (minute % 2 === 1) ctx.waitUntil(updateLineups(env as LineupsEnv).catch((error) => {
      console.error(JSON.stringify({ event: "lineups_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // Where FPL's own season totals stand, written down once a gameweek. It is the only
    // way to have a per-gameweek FPL figure at all: the game publishes no window but the
    // season, so a week of it is one snapshot less the one before.
    if (minute % 5 === 3) ctx.waitUntil(updateFplHistory(env as FplHistoryEnv).catch((error) => {
      console.error(JSON.stringify({ event: "fpl_history_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // Who has played since, on the same hourly gate: minutes settle within the hour after a
    // match and nothing here moves faster than that.
    if (minute % 5 === 2) ctx.waitUntil(updateAppearances(env as AppearancesEnv).catch((error) => {
      console.error(JSON.stringify({ event: "appearances_error", error: error instanceof Error ? error.message : String(error) }));
    }));
    // The dataset rebuilds three times a day; reading it hourly, on a minute of its own,
    // is already more often than it can change.
    if (minute % 5 === 4) ctx.waitUntil(updateInsights(env as InsightsEnv).catch((error) => {
      console.error(JSON.stringify({ event: "insights_error", error: error instanceof Error ? error.message : String(error) }));
    }));
  },
} satisfies ExportedHandler<Env>;
