import { captureTable, handleTelegramWebhook, runTelegramSchedule, type TelegramEnv } from "./telegram";

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
  if (pathname === "/api/fixtures") return { path: "/api/fixtures/", ttl: 60 };
  if (pathname === "/api/league") return { path: `/api/leagues-classic/${env.FPL_LEAGUE_ID}/standings/?page_standings=1&page_new_entries=1`, ttl: 60 };
  const live = pathname.match(/^\/api\/event\/(\d+)\/live$/);
  if (live) return { path: `/api/event/${live[1]}/live/`, ttl: 30 };
  const entry = pathname.match(/^\/api\/entry\/(\d+)$/);
  if (entry) return { path: `/api/entry/${entry[1]}/`, ttl: 120 };
  const history = pathname.match(/^\/api\/entry\/(\d+)\/history$/);
  if (history) return { path: `/api/entry/${history[1]}/history/`, ttl: 300 };
  const transfers = pathname.match(/^\/api\/entry\/(\d+)\/transfers$/);
  if (transfers) return { path: `/api/entry/${transfers[1]}/transfers/`, ttl: 120 };
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
    if (request.method === "GET" && url.pathname === "/admin/table-screenshot") {
      const telegramEnv = env as TelegramEnv;
      if (!telegramEnv.SCREENSHOT_PREVIEW_SECRET || request.headers.get("Authorization") !== `Bearer ${telegramEnv.SCREENSHOT_PREVIEW_SECRET}`) return new Response("Unauthorized", { status: 401 });
      try {
        const screenshot = await captureTable(telegramEnv, url.searchParams.get("demo") === "1");
        return new Response(screenshot, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, request, env, 502);
      }
    }
    if (request.method !== "GET") return json({ error: "Method not allowed" }, request, env, 405);
    if (url.pathname === "/health") return json({ ok: true, leagueId: env.FPL_LEAGUE_ID }, request, env);
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
  },
} satisfies ExportedHandler<Env>;
