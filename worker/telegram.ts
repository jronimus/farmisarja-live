import { readCatalog, type CatalogEvent } from "./catalog";

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

export type ShareCardKind = "round" | "total" | "awards" | "deadline";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Each card is drawn at its delivered size, so the viewport only needs to clear it.
 *
 * A 429 is worth one short wait and no more. The backoff here used to climb 15, 30, 45,
 * 60, 75 seconds — nearly four minutes inside one invocation — from when three cards were
 * captured back to back. The album is spread over cron ticks now, one card each, so the
 * retry already exists at a level above this one and waiting here only makes an invocation
 * outlive the gap to the next tick. Two of them then hold the same browser open and both
 * get the 429 the wait was meant to avoid, while `job.done` never advances and every tick
 * starts the album from its first card again.
 */
export async function captureCard(env: TelegramEnv, kind: ShareCardKind, attempt = 0): Promise<Blob> {
  const response = await env.BROWSER.quickAction("screenshot", {
    url: `${env.PUBLIC_SITE_URL}?card=${kind}`,
    selector: ".sc-card",
    viewport: { width: 1160, height: 1440, deviceScaleFactor: 1 },
    gotoOptions: { waitUntil: "networkidle0", timeout: 45_000 },
    screenshotOptions: { type: "png" },
  });
  if (response.status === 429 && attempt < 1) {
    const delay = 10_000;
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
  /**
   * Which of the two messages have already landed.
   *
   * The report goes out as a photo and then a pair, and on 31 Aug the pair failed after the
   * photo had already been delivered. Nothing was written down until both had succeeded, so
   * the whole turn was lost — the captured card, the fact that the photo had gone — and the
   * next turn captured again and sent the same photo to the group a second time. It would
   * have done that every six minutes for as long as the pair kept failing. A message that
   * has landed is now recorded the moment it lands, and a retry sends only what is left.
   */
  sent?: AlbumStage[];
}

type AlbumStage = "photo" | "group";

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

async function sendQueuedAlbum(env: TelegramEnv, key: string, job: AlbumJob): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const sent = new Set<AlbumStage>(job.sent ?? []);
  const part = async (kind: ShareCardKind): Promise<Blob> => {
    const bytes = await env.TELEGRAM_STATE.get(`${key}:${kind}`, "arrayBuffer");
    if (!bytes) throw new Error(`Album part missing: ${kind}`);
    return new Blob([bytes], { type: "image/png" });
  };
  const post = async (method: string, body: FormData) => {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body });
    if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  };
  // Written down before the next message is attempted, never after both.
  const mark = async (stage: AlbumStage) => {
    sent.add(stage);
    await env.TELEGRAM_STATE.put(key, JSON.stringify({ ...job, sent: [...sent] } satisfies AlbumJob), { expirationTtl: ALBUM_TTL });
  };

  if (!sent.has("photo")) {
    const first = new FormData();
    first.set("chat_id", job.chat);
    first.set("photo", await part("round"), "round.png");
    first.set("reply_markup", JSON.stringify(button(env)));
    await post("sendPhoto", first);
    await mark("photo");
  }

  if (!sent.has("group")) {
    const second = new FormData();
    second.set("chat_id", job.chat);
    const pair: ShareCardKind[] = ["total", "awards"];
    for (const [index, kind] of pair.entries()) second.set(`file${index}`, await part(kind), `${kind}.png`);
    second.set("media", JSON.stringify(pair.map((_, index) => ({ type: "photo", media: `attach://file${index}` }))));
    await post("sendMediaGroup", second);
    await mark("group");
  }

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
    // A capture is banked and the turn ends there. The last card used to be sent in the
    // same breath as it was taken, which is how a failed send threw away a nine second
    // screenshot along with the record of what had already gone out.
    const bytes = await (await captureCard(env, next)).arrayBuffer();
    job.done.push(next);
    await env.TELEGRAM_STATE.put(`${key}:${next}`, bytes, { expirationTtl: ALBUM_TTL });
    await env.TELEGRAM_STATE.put(key, JSON.stringify(job), { expirationTtl: ALBUM_TTL });
    console.log(JSON.stringify({ event: "album_card_ready", key, kind: next, done: job.done.length }));
    return true;
  }
  await sendQueuedAlbum(env, key, job);
  console.log(JSON.stringify({ event: "album_sent", key }));
  return true;
}

/** One card, the link button, and no caption: the card already says what it is. */
async function sendCardPhoto(env: TelegramEnv, chatId: number | string, kind: ShareCardKind): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("reply_markup", JSON.stringify(button(env)));
  form.set("photo", await captureCard(env, kind), `${kind}.png`);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Telegram sendPhoto failed: ${response.status} ${await response.text()}`);
}

function nextDeadline(events: CatalogEvent[], now: number): CatalogEvent | undefined {
  return events.filter((event) => new Date(event.deadline_time).getTime() > now).sort((a, b) => a.id - b.id)[0];
}

export function deadlineRemaining(event: CatalogEvent, now: number): string {
  const minutes = Math.max(0, Math.ceil((new Date(event.deadline_time).getTime() - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} ${days === 1 ? "päivä" : "päivää"} ${hours} ${hours === 1 ? "tunti" : "tuntia"}`;
  if (hours > 0) return `${hours} ${hours === 1 ? "tunti" : "tuntia"} ${rest} minuuttia`;
  return `${rest} minuuttia`;
}

const deadlineClock = (event: CatalogEvent) => new Intl.DateTimeFormat("fi-FI", {
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

/**
 * A gameweek id is not unique — GW3 comes round again next season — so the mark a send
 * leaves behind is given a life a little longer than a season. Without it the first
 * GW3 of 2027-28 would find last season's mark still standing and stay silent.
 */
const SENT_TTL = 300 * 86_400;

async function sendOnce(env: TelegramEnv, key: string, task: () => Promise<void>): Promise<boolean> {
  if (await env.TELEGRAM_STATE.get(key)) return false;
  await task();
  await env.TELEGRAM_STATE.put(key, new Date().toISOString(), { expirationTtl: SENT_TTL });
  return true;
}

/**
 * Due from the moment the target is crossed, with no window on the far side of it.
 *
 * There used to be five minutes here, so a reminder had to be caught by one of five ticks
 * or it was lost for good — and a tick is not guaranteed: a cron invocation that runs out
 * of budget takes every unfinished task on it down with it, silently. Sending it late is
 * strictly better than not sending it, and the message carries the real time left rather
 * than the round number it was scheduled on, so a late one does not lie about it. Nothing
 * repeats: `sendOnce` still holds the mark.
 */
export function reminderIsDue(remaining: number, target: number): boolean {
  return remaining <= target && remaining > 0;
}

async function checkDeadlineReminders(env: TelegramEnv, events: CatalogEvent[], now: number): Promise<void> {
  const event = nextDeadline(events, now);
  if (!event || !env.TELEGRAM_CHAT_ID) return;
  const remaining = new Date(event.deadline_time).getTime() - now;
  for (const hours of [24, 2]) {
    if (!reminderIsDue(remaining, hours * 3_600_000)) continue;
    await sendOnce(env, `deadline:${event.id}:${hours}h`, () => sendLinkMessage(
      env, env.TELEGRAM_CHAT_ID!,
      `${hours === 24 ? "⏰" : "🚨"} GW${event.id}-deadlineen ${deadlineRemaining(event, now)} — klo ${deadlineClock(event)}`,
    ));
  }
}

/** Once every manager's picks are readable, the deadline card can be drawn from them. */
async function checkDeadlineCard(env: TelegramEnv, event: CatalogEvent, now: number): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID || now < new Date(event.deadline_time).getTime()) return;
  // The mark is read before the league is, not after: the card is sent once and the
  // gameweek runs for another week, and reading a dozen managers' picks on every tick of
  // that week is a dozen requests a minute spent to learn nothing.
  const sentKey = `deadline-card:gw:${event.id}`;
  if (await env.TELEGRAM_STATE.get(sentKey)) return;
  const league = await fpl<LeagueResponse>(`/leagues-classic/${env.FPL_LEAGUE_ID}/standings/?page_standings=1&page_new_entries=1`);
  const entries = league.standings.results.length ? league.standings.results : league.new_entries.results;
  if (!await picksAvailable(event.id, entries)) return;
  await sendOnce(env, sentKey, () => sendCardPhoto(env, env.TELEGRAM_CHAT_ID!, "deadline"));
}

/**
 * Queued the moment FPL calls the last match, with no wait of its own.
 *
 * There used to be ten minutes here to let the bonus settle. Watching a gameweek out showed
 * nothing to wait for: while the last match ran its own bonus moved every minute or two,
 * and every already-finished match sat still. The report is titled as provisional anyway,
 * and queueing is not sending — the album takes a card per cron tick, because Browser
 * Rendering's free plan allows one request per ten seconds, so a few minutes pass between
 * this and the message regardless.
 */
async function checkPostGame(env: TelegramEnv, event: CatalogEvent): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID) return;
  // Before the fixture list, not after it: once the report is queued this is the rest of
  // the gameweek's ticks reading a few hundred kilobytes to reach the same answer.
  const sentKey = `postgame:gw:${event.id}`;
  if (await env.TELEGRAM_STATE.get(sentKey)) return;
  const fixtures = (await fpl<Fixture[]>("/fixtures/")).filter((fixture) => fixture.event === event.id);
  // FPL can leave finished unset long after full time, so full time is what schedules the report.
  if (!fixtures.length || fixtures.some((fixture) => !fixture.finished && !fixture.finished_provisional)) return;
  await sendOnce(env, sentKey, () => queueAlbum(env, `album:gw:${event.id}`, env.TELEGRAM_CHAT_ID!));
}

/**
 * The reminders are not held hostage by the cards.
 *
 * Everything below the reminders reads FPL again, draws a picture, or talks to Browser
 * Rendering, and any of it can throw or run the invocation out of budget. When it did, the
 * whole schedule went down with it and a deadline passed with nothing said. The reminders
 * are the cheap part and they go first; each stage after them is fenced off on its own.
 */
async function stage(name: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_stage_error", stage: name, error: error instanceof Error ? error.message : String(error) }));
  }
}

/**
 * The reminders, and nothing else, on every single tick.
 *
 * They are separated from the rest of the schedule because they are the part with a
 * deadline of their own and the part that costs nothing: the gameweek list arrives already
 * parsed from the catalog, so this is a comparison of two numbers and, twice a week, one
 * message. Everything expensive the chat does now waits its turn in the rotation instead of
 * sharing an invocation with this.
 */
export async function runDeadlineReminders(env: TelegramEnv, events: CatalogEvent[], now = Date.now()): Promise<void> {
  if (env.TELEGRAM_NOTIFICATIONS_ENABLED !== "true") return;
  await stage("reminders", () => checkDeadlineReminders(env, events, now));
}

/**
 * The chat's expensive half: the deadline card, the post-game album, and the capture of one
 * album card per turn. Given a tick to itself by the rotation in `index.ts`.
 */
export async function runTelegramJobs(env: TelegramEnv, events: CatalogEvent[], now = Date.now()): Promise<void> {
  if (env.TELEGRAM_NOTIFICATIONS_ENABLED !== "true") return;
  const current = events.find((event) => event.is_current);
  if (!current) return;
  await stage("deadline_card", () => checkDeadlineCard(env, current, now));
  await stage("postgame", () => checkPostGame(env, current));
  // One capture per turn keeps every invocation well inside its time budget.
  let advanced = false;
  await stage("album_preview", async () => { advanced = await advanceAlbum(env, "album:preview"); });
  if (advanced) return;
  await stage("album_gameweek", async () => { await advanceAlbum(env, `album:gw:${current.id}`); });
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
      // From the catalog, not the bootstrap: this reply is a fetch invocation and has the
      // same ten milliseconds to live in as a tick does. It used to parse 1.6 MB to read
      // one timestamp out of it.
      const catalog = await readCatalog(env);
      const event = catalog && nextDeadline(catalog.events, Date.now());
      await sendLinkMessage(env, chatId, event ? `⏰ GW${event.id}-deadlineen ${deadlineRemaining(event, Date.now())}` : "Seuraavaa deadlinea ei ole vielä julkaistu.");
    })());
  }
  return new Response("OK");
}
