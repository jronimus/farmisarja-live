interface FplEvent { id: number; deadline_time: string; is_current: boolean; is_next: boolean; }
interface BootstrapResponse { events: FplEvent[]; }
interface LeagueEntry { entry: number; }
interface LeagueResponse { standings: { results: LeagueEntry[] }; new_entries: { results: LeagueEntry[] }; }
interface Fixture { event: number | null; finished: boolean; finished_provisional: boolean; }
interface TelegramMessage { chat?: { id?: number | string }; text?: string; }
interface TelegramUpdate { message?: TelegramMessage; edited_message?: TelegramMessage; }

export type TelegramEnv = Env & {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SCREENSHOT_PREVIEW_SECRET?: string;
};

async function fpl<T>(path: string): Promise<T> {
  const response = await fetch(`https://fantasy.premierleague.com/api${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
  });
  if (!response.ok) throw new Error(`FPL request failed: ${response.status} ${path}`);
  return response.json() as Promise<T>;
}

const button = (env: TelegramEnv) => ({ inline_keyboard: [[{ text: "FARMISARJA LIVE", url: env.PUBLIC_SITE_URL }]] });

async function telegramApi(env: TelegramEnv, method: string, body: unknown): Promise<Response> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  return response;
}

async function sendLinkMessage(env: TelegramEnv, chatId: number | string, text: string): Promise<void> {
  await telegramApi(env, "sendMessage", { chat_id: chatId, text, reply_markup: button(env), disable_web_page_preview: true });
}

export type ShareCardKind = "round" | "total" | "awards";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Each card is drawn at its delivered size, so the viewport only needs to clear it.
 * Browser Rendering rate limits back to back calls, so a 429 is waited out rather than
 * thrown: three cards in a row will otherwise fail on the second one.
 */
export async function captureCard(env: TelegramEnv, kind: ShareCardKind, attempt = 0): Promise<Blob> {
  const response = await env.BROWSER.quickAction("screenshot", {
    url: `${env.PUBLIC_SITE_URL}?card=${kind}`,
    selector: ".sc-card",
    viewport: { width: 1160, height: 1440, deviceScaleFactor: 1 },
    gotoOptions: { waitUntil: "networkidle0", timeout: 45_000 },
    screenshotOptions: { type: "png" },
  });
  if (response.status === 429 && attempt < 5) {
    const delay = 15_000 * (attempt + 1);
    console.log(JSON.stringify({ event: "card_rate_limited", kind, attempt, delay }));
    await wait(delay);
    return captureCard(env, kind, attempt + 1);
  }
  if (!response.ok) throw new Error(`Card screenshot failed: ${kind} ${response.status} ${await response.text()}`);
  return response.blob();
}

/**
 * The three cards go out as one album, so the group gets a single notification rather
 * than three. Albums carry no inline keyboard, so the link rides in the caption and the
 * card itself prints the address.
 */
interface AlbumJob {
  chat: string;
  done: ShareCardKind[];
}

const ALBUM_KINDS: ShareCardKind[] = ["round", "total", "awards"];
const ALBUM_TTL = 3 * 3600;

/**
 * A capture takes about nine seconds and Browser Rendering rate limits back to back
 * calls, so three of them cannot fit inside one invocation: spacing them enough to
 * avoid the 429 runs past the thirty second limit and the whole album is cancelled.
 * The job is therefore spread across cron ticks, one card each, with the PNGs parked
 * in KV until the set is complete.
 */
export async function queueAlbum(env: TelegramEnv, key: string, chat: string): Promise<void> {
  const job: AlbumJob = { chat, done: [] };
  await env.TELEGRAM_STATE.put(key, JSON.stringify(job), { expirationTtl: ALBUM_TTL });
}

async function sendQueuedAlbum(env: TelegramEnv, key: string, job: AlbumJob, fresh?: { kind: ShareCardKind; bytes: ArrayBuffer }): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const part = async (kind: ShareCardKind): Promise<Blob> => {
    const bytes = fresh && fresh.kind === kind ? fresh.bytes : await env.TELEGRAM_STATE.get(`${key}:${kind}`, "arrayBuffer");
    if (!bytes) throw new Error(`Album part missing: ${kind}`);
    return new Blob([bytes], { type: "image/png" });
  };
  const post = async (method: string, body: FormData) => {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body });
    if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  };

  const first = new FormData();
  first.set("chat_id", job.chat);
  first.set("photo", await part("round"), "round.png");
  first.set("reply_markup", JSON.stringify(button(env)));
  await post("sendPhoto", first);

  const second = new FormData();
  second.set("chat_id", job.chat);
  const pair: ShareCardKind[] = ["total", "awards"];
  for (const [index, kind] of pair.entries()) second.set(`file${index}`, await part(kind), `${kind}.png`);
  second.set("media", JSON.stringify(pair.map((_, index) => ({ type: "photo", media: `attach://file${index}` }))));
  await post("sendMediaGroup", second);

  await Promise.all([
    env.TELEGRAM_STATE.delete(key),
    ...ALBUM_KINDS.map((kind) => env.TELEGRAM_STATE.delete(`${key}:${kind}`)),
  ]);
}

/** Does one unit of work for a queued album and reports whether anything happened. */
export async function advanceAlbum(env: TelegramEnv, key: string): Promise<boolean> {
  const stored = await env.TELEGRAM_STATE.get(key);
  if (!stored) return false;
  const job = JSON.parse(stored) as AlbumJob;
  const next = ALBUM_KINDS.find((kind) => !job.done.includes(kind));
  if (next) {
    const bytes = await (await captureCard(env, next)).arrayBuffer();
    job.done.push(next);
    console.log(JSON.stringify({ event: "album_card_ready", key, kind: next, done: job.done.length }));
    if (job.done.length === ALBUM_KINDS.length) {
      await sendQueuedAlbum(env, key, job, { kind: next, bytes });
      console.log(JSON.stringify({ event: "album_sent", key }));
      return true;
    }
    await env.TELEGRAM_STATE.put(`${key}:${next}`, bytes, { expirationTtl: ALBUM_TTL });
    await env.TELEGRAM_STATE.put(key, JSON.stringify(job), { expirationTtl: ALBUM_TTL });
    return true;
  }
  await sendQueuedAlbum(env, key, job);
  console.log(JSON.stringify({ event: "album_sent", key }));
  return true;
}
export async function captureTable(env: TelegramEnv, demo = false, lightTheme = false): Promise<Blob> {
  const query = new URLSearchParams({ screenshot: "1" });
  if (demo) query.set("demo", "1");
  if (lightTheme) query.set("theme", "light");
  const response = await env.BROWSER.quickAction("screenshot", {
    url: `${env.PUBLIC_SITE_URL}?${query.toString()}`,
    selector: ".league-table",
    viewport: { width: 1340, height: 1200, deviceScaleFactor: 1 },
    gotoOptions: { waitUntil: "networkidle0", timeout: 45_000 },
    screenshotOptions: { type: "png" },
  });
  if (!response.ok) throw new Error(`Screenshot failed: ${response.status} ${await response.text()}`);
  return response.blob();
}

async function sendTablePhoto(env: TelegramEnv, chatId: number | string, caption: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption);
  form.set("reply_markup", JSON.stringify(button(env)));
  form.set("photo", await captureTable(env, false, true), "farmisarja-live.png");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Telegram sendPhoto failed: ${response.status} ${await response.text()}`);
}

function nextDeadline(events: FplEvent[], now: number): FplEvent | undefined {
  return events.filter((event) => new Date(event.deadline_time).getTime() > now).sort((a, b) => a.id - b.id)[0];
}

export function deadlineRemaining(event: FplEvent, now: number): string {
  const minutes = Math.max(0, Math.ceil((new Date(event.deadline_time).getTime() - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} ${days === 1 ? "päivä" : "päivää"} ${hours} ${hours === 1 ? "tunti" : "tuntia"}`;
  if (hours > 0) return `${hours} ${hours === 1 ? "tunti" : "tuntia"} ${rest} minuuttia`;
  return `${rest} minuuttia`;
}

const deadlineClock = (event: FplEvent) => new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit",
}).format(new Date(event.deadline_time));

async function picksAvailable(gameweek: number, entries: LeagueEntry[]): Promise<boolean> {
  if (!entries.length) return false;
  const responses = await Promise.all(entries.map(({ entry }) => fetch(
    `https://fantasy.premierleague.com/api/entry/${entry}/event/${gameweek}/picks/`,
    { headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" } },
  )));
  return responses.every((response) => response.ok);
}

async function sendOnce(env: TelegramEnv, key: string, task: () => Promise<void>): Promise<boolean> {
  if (await env.TELEGRAM_STATE.get(key)) return false;
  await task();
  await env.TELEGRAM_STATE.put(key, new Date().toISOString());
  return true;
}

export function reminderIsDue(remaining: number, target: number): boolean {
  return remaining <= target && remaining > target - 5 * 60_000;
}

async function checkDeadlineReminders(env: TelegramEnv, events: FplEvent[], now: number): Promise<void> {
  const event = nextDeadline(events, now);
  if (!event || !env.TELEGRAM_CHAT_ID) return;
  const remaining = new Date(event.deadline_time).getTime() - now;
  for (const reminder of [{ hours: 24, label: "huomenna" }, { hours: 2, label: "2 tunnin päästä" }]) {
    const target = reminder.hours * 3_600_000;
    if (!reminderIsDue(remaining, target)) continue;
    await sendOnce(env, `deadline:${event.id}:${reminder.hours}h`, () => sendLinkMessage(
      env, env.TELEGRAM_CHAT_ID!,
      `${reminder.hours === 24 ? "⏰" : "🚨"} GW${event.id}-deadline ${reminder.label} — klo ${deadlineClock(event)}`,
    ));
  }
}

async function checkTableReady(env: TelegramEnv, event: FplEvent, now: number): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID || now < new Date(event.deadline_time).getTime()) return;
  const league = await fpl<LeagueResponse>(`/leagues-classic/${env.FPL_LEAGUE_ID}/standings/?page_standings=1&page_new_entries=1`);
  const entries = league.standings.results.length ? league.standings.results : league.new_entries.results;
  if (!await picksAvailable(event.id, entries)) return;
  await sendOnce(env, `table-ready:gw:${event.id}`, () => sendTablePhoto(env, env.TELEGRAM_CHAT_ID!, `🏁 GW${event.id} on käynnissä!`));
}

async function checkPostGame(env: TelegramEnv, event: FplEvent, now: number): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID) return;
  const fixtures = (await fpl<Fixture[]>("/fixtures/")).filter((fixture) => fixture.event === event.id);
  // FPL can leave finished unset long after full time, so full time is what schedules the report.
  if (!fixtures.length || fixtures.some((fixture) => !fixture.finished && !fixture.finished_provisional)) return;
  const sentKey = `postgame:gw:${event.id}`;
  if (await env.TELEGRAM_STATE.get(sentKey)) return;
  const detectedKey = `postgame-detected:gw:${event.id}`;
  const detected = await env.TELEGRAM_STATE.get(detectedKey);
  if (!detected) {
    await env.TELEGRAM_STATE.put(detectedKey, new Date(now).toISOString());
    return;
  }
  if (now - new Date(detected).getTime() < 10 * 60_000) return;
  await sendOnce(env, sentKey, () => queueAlbum(env, `album:gw:${event.id}`, env.TELEGRAM_CHAT_ID!));
}

export async function runTelegramSchedule(env: TelegramEnv, now = Date.now()): Promise<void> {
  if (env.TELEGRAM_NOTIFICATIONS_ENABLED !== "true") return;
  const bootstrap = await fpl<BootstrapResponse>("/bootstrap-static/");
  await checkDeadlineReminders(env, bootstrap.events, now);
  const current = bootstrap.events.find((event) => event.is_current);
  if (!current) return;
  await checkTableReady(env, current, now);
  await checkPostGame(env, current, now);
  // One capture per tick keeps every invocation well inside its time budget.
  if (await advanceAlbum(env, "album:preview")) return;
  await advanceAlbum(env, `album:gw:${current.id}`);
}

export async function handleTelegramWebhook(request: Request, env: TelegramEnv, ctx: ExecutionContext): Promise<Response> {
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  const update = await request.json<TelegramUpdate>();
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const command = message?.text?.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  if (!chatId || !command) return new Response("OK");
  if (command === "/farmisarja") {
    ctx.waitUntil(sendLinkMessage(env, chatId, "⚽ Farmisarja Live"));
  } else if (command === "/id") {
    // Answers with the id of whatever chat it was sent in, which is how a private chat
    // becomes addressable without anyone reading the token.
    ctx.waitUntil(telegramApi(env, "sendMessage", { chat_id: chatId, text: `Tämän chatin tunnus: ${chatId}` }).then(() => undefined));
  } else if (command === "/kortit") {
    // Queues the report for the asker. The cron builds it one card at a time, so the
    // reply only promises it rather than waiting for three captures inline.
    ctx.waitUntil((async () => {
      await queueAlbum(env, "album:preview", String(chatId));
      await telegramApi(env, "sendMessage", { chat_id: chatId, text: "Kortit ovat tulossa, se kestaa pari minuuttia." });
    })());
  } else if (command === "/deadline") {
    ctx.waitUntil((async () => {
      const bootstrap = await fpl<BootstrapResponse>("/bootstrap-static/");
      const event = nextDeadline(bootstrap.events, Date.now());
      await sendLinkMessage(env, chatId, event ? `⏰ GW${event.id}-deadlineen ${deadlineRemaining(event, Date.now())}` : "Seuraavaa deadlinea ei ole vielä julkaistu.");
    })());
  }
  return new Response("OK");
}
