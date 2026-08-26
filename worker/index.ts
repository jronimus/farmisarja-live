import { captureCard, handleTelegramWebhook, runTelegramSchedule, type ShareCardKind, type TelegramEnv } from "./telegram";
import { advanceSample, computeCurve, type LiveRankEnv } from "./liveRank";
import { readFeed, updateFeed, type EventsEnv } from "./events";
import { allChanges, readHistory, updatePriceHistory, type PriceHistoryEnv } from "./priceHistory";
import { readArticles, updateArticles, type ArticlesEnv } from "./articles";

const CARD_KINDS: ShareCardKind[] = ["round", "total", "awards", "deadline"];

const FPL_ORIGIN = "https://fantasy.premierleague.com";

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = origin === env.ALLOWED_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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
      return new Response(JSON.stringify({ articles: stored?.articles ?? [] }), {
        headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
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
  async scheduled(_controller, env, ctx): Promise<void> {
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
  },
} satisfies ExportedHandler<Env>;
