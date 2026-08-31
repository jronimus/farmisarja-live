/**
 * Whether the cron is alive, and telling somebody when it is not.
 *
 * The outage of 28–30 August lasted three days and was found by hand, in the analytics,
 * after it had already cost two deadline reminders and an afternoon of the ticker. Nothing
 * had raised its voice: a Worker killed for exceeding its CPU budget throws no exception
 * and writes no log, so every stage simply stopped happening and every stage's own error
 * handling had nothing to report.
 *
 * The mark that catches that has to be written by the *end* of a tick — a tick that dies
 * halfway never reaches it — and read at the *start* of one, before anything expensive can
 * kill the invocation. So the beat is written on one tick in ten and the check runs on
 * every one of them, and it costs a KV read and a comparison.
 */

export interface HealthEnv {
  TELEGRAM_STATE: KVNamespace;
  TELEGRAM_BOT_TOKEN?: string;
  /**
   * Where an alert goes, and the only place it can go.
   *
   * Deliberately not `TELEGRAM_CHAT_ID`: that is the league group, and an outage is the
   * maintainer's problem, not eleven other people's. There is no fallback — with this
   * unset the watchdog logs and says nothing to anybody, which is the right failure for a
   * setting whose whole purpose is choosing an audience. Set it to a private chat id, which
   * the bot answers with when sent `/id` there.
   */
  TELEGRAM_ALERT_CHAT_ID?: string;
}

interface Heartbeat { at: string }

const BEAT_KEY = "health:tick";
const ALERT_KEY = "health:alert";

/** One beat every ten minutes: often enough to place an outage, cheap against the day's writes. */
export const BEAT_EVERY = 10;
/**
 * Two missed beats before anybody is told. A single one can be an ordinary skipped tick —
 * Cloudflare does not promise the minute — and waking the chat for that would teach
 * everyone to ignore the next one.
 */
const STALE_MS = 25 * 60_000;
/** How long an alert stands before the same silence is worth mentioning again. */
const ALERT_TTL = 3600;

export async function writeHeartbeat(env: HealthEnv, now = Date.now()): Promise<void> {
  await env.TELEGRAM_STATE.put(BEAT_KEY, JSON.stringify({ at: new Date(now).toISOString() } satisfies Heartbeat));
}

/** How long the cron has been unable to finish a tick, or null when it never had one to miss. */
export async function beatAge(env: HealthEnv, now = Date.now()): Promise<number | null> {
  const beat = await env.TELEGRAM_STATE.get<Heartbeat>(BEAT_KEY, "json");
  if (!beat) return null;
  return now - Date.parse(beat.at);
}

/**
 * Read first, before anything that can kill the tick.
 *
 * A missing beat is not an outage: it is a Worker that has just been deployed, or a
 * namespace that has just been emptied, and the next tick writes one. Only an old beat is
 * news.
 */
export async function checkHeartbeat(env: HealthEnv, now = Date.now()): Promise<{ alerted: boolean; age: number | null }> {
  const age = await beatAge(env, now);
  if (age === null || age < STALE_MS) return { alerted: false, age };
  if (await env.TELEGRAM_STATE.get(ALERT_KEY)) return { alerted: false, age };

  const minutes = Math.round(age / 60_000);
  // The log line stands whether or not there is anywhere to send it. `/health` reports the
  // same staleness to anyone who asks, so the outage is visible without a chat at all.
  console.error(JSON.stringify({ event: "cron_stalled", minutes }));
  if (env.TELEGRAM_ALERT_CHAT_ID && env.TELEGRAM_BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_ALERT_CHAT_ID,
        text: `⚠️ Farmisarja: ajastin ei ole päässyt loppuun ${minutes} minuuttiin. Ticker ja muistutukset voivat olla jäljessä.`,
        disable_web_page_preview: true,
      }),
    });
  }
  // The mark is written whether or not the chat could be reached, so an unreachable chat
  // costs one alert and not a message a minute for as long as the outage lasts.
  await env.TELEGRAM_STATE.put(ALERT_KEY, new Date(now).toISOString(), { expirationTtl: ALERT_TTL });
  return { alerted: true, age };
}
