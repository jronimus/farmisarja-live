interface FplEvent {
  id: number;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
}

interface BootstrapResponse {
  events: FplEvent[];
}

interface LeagueEntry {
  entry: number;
}

interface LeagueResponse {
  standings: { results: LeagueEntry[] };
  new_entries: { results: LeagueEntry[] };
}

async function fpl<T>(path: string): Promise<T> {
  const response = await fetch(`https://fantasy.premierleague.com/api${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
  });
  if (!response.ok) throw new Error(`FPL request failed: ${response.status} ${path}`);
  return response.json() as Promise<T>;
}

async function gameweekPicksAreAvailable(gameweek: number, entries: LeagueEntry[]): Promise<boolean> {
  if (!entries.length) return false;
  const responses = await Promise.all(entries.map(({ entry }) =>
    fetch(`https://fantasy.premierleague.com/api/entry/${entry}/event/${gameweek}/picks/`, {
      headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    }),
  ));
  return responses.every((response) => response.ok);
}

async function sendTelegramMessage(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error("Telegram secrets are not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error(`Telegram send failed: ${response.status} ${await response.text()}`);
}

function tableReadyMessage(env: Env, gameweek: number): string {
  return `GW${gameweek}-taulukko on nyt päivittynyt.\n${env.PUBLIC_SITE_URL}`;
}

export async function checkTableReadyNotification(env: Env): Promise<void> {
  if (env.TELEGRAM_NOTIFICATIONS_ENABLED !== "true") return;

  const bootstrap = await fpl<BootstrapResponse>("/bootstrap-static/");
  const event = bootstrap.events.find((item) => item.is_current) ?? bootstrap.events.find((item) => item.is_next);
  if (!event || Date.now() < new Date(event.deadline_time).getTime()) return;

  const stateKey = `table-ready:gw:${event.id}`;
  if (await env.TELEGRAM_STATE.get(stateKey)) return;

  const league = await fpl<LeagueResponse>(`/leagues-classic/${env.FPL_LEAGUE_ID}/standings/?page_standings=1&page_new_entries=1`);
  const entries = league.standings.results.length ? league.standings.results : league.new_entries.results;
  if (!await gameweekPicksAreAvailable(event.id, entries)) return;

  await sendTelegramMessage(env, tableReadyMessage(env, event.id));
  await env.TELEGRAM_STATE.put(stateKey, new Date().toISOString());
}
