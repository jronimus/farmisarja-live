/**
 * What should have happened by now, and whether it did.
 *
 * The watchdog in `health.ts` answers one question — is the cron running — and it answers it
 * well. But every gap since it was written has been of a different kind: the cron was running
 * fine and one particular thing quietly did not happen. A deadline card that could not get a
 * turn for three hours. Reminders that were never sent. An album that stopped halfway. In
 * every one of those the ticks were healthy, the heartbeat was current, and the only thing
 * that noticed was the owner, hours later, asking why nothing had arrived.
 *
 * That is the wrong way round, and this is the fix for it. Everything the schedule owes the
 * chat leaves a mark in KV when it is done, and every one of those marks has a time by which
 * it should exist. So the marks can simply be checked. Anything overdue is named, once an
 * hour, in the maintainer's own chat — and `/health` says the same thing to anyone who asks.
 *
 * The rule this is meant to enforce, for whatever gets added next: **if the schedule owes
 * somebody something, it belongs in `expectationsFor` on the same day it is written.** A new
 * output with no expectation is a new way to fail silently, and there have been enough of
 * those.
 */

import type { Catalog } from "./catalog";
import { alertOnce, type HealthEnv } from "./health";

export interface ExpectationsEnv extends HealthEnv {}

export interface Expectation {
  /** What to call it in the message. */
  name: string;
  /** The KV key that proves it happened. */
  mark: string;
  /** When it stops being "not yet" and starts being "late". */
  dueAt: number;
  /**
   * Inverted: the mark is a job in flight, and what is wrong is that it is *still there*.
   * A half-sent album leaves its job behind, which is exactly the shape of the 31 Aug bug.
   */
  absent?: boolean;
}

/** Generous, deliberately. This should fire when something is wrong, not when it is slow. */
const CARD_GRACE_MS = 60 * 60_000;
const REMINDER_GRACE_MS = 30 * 60_000;
/** A match, and then some, before the report is owed. */
const AFTER_LAST_KICKOFF_MS = 4 * 3_600_000;
/** An album gets two hours to assemble itself before its leftovers count as stuck. */
const ALBUM_LIMIT_MS = AFTER_LAST_KICKOFF_MS + 2 * 3_600_000;

const lastKickoff = (catalog: Catalog, event: number): number | null => {
  const times = catalog.fixtures.filter((fixture) => fixture.event === event).map((fixture) => Date.parse(fixture.kickoff));
  return times.length ? Math.max(...times) : null;
};

/**
 * Everything the schedule owes, with the time it falls due.
 *
 * Pure, so the whole set can be read in a test without a KV namespace or a clock.
 */
export function expectationsFor(catalog: Catalog, now: number): Expectation[] {
  const due: Expectation[] = [];

  // The two reminders belong to whichever deadline is next, and stay owed for a day after it
  // passes: a reminder that never went is worth hearing about once, and then it is history.
  // A week of it would be nagging about something nobody can act on any more.
  const next = catalog.events
    .filter((event) => Date.parse(event.deadline_time) > now - 24 * 3_600_000)
    .sort((a, b) => Date.parse(a.deadline_time) - Date.parse(b.deadline_time))[0];
  if (next) {
    const deadline = Date.parse(next.deadline_time);
    for (const hours of [24, 2]) {
      due.push({
        name: `GW${next.id} ${hours}h muistutus`,
        mark: `deadline:${next.id}:${hours}h`,
        dueAt: deadline - hours * 3_600_000 + REMINDER_GRACE_MS,
      });
    }
  }

  const current = catalog.events.find((event) => event.is_current);
  if (!current) return due;

  due.push({
    name: `GW${current.id} deadline-kortti`,
    mark: `deadline-card:gw:${current.id}`,
    dueAt: Date.parse(current.deadline_time) + CARD_GRACE_MS,
  });

  const last = lastKickoff(catalog, current.id);
  if (last !== null) {
    due.push({
      name: `GW${current.id} loppuraportti`,
      mark: `postgame:gw:${current.id}`,
      dueAt: last + AFTER_LAST_KICKOFF_MS,
    });
    // Not that it started, but that it finished: the job key is deleted by the send.
    due.push({
      name: `GW${current.id} kuvat jumissa`,
      mark: `album:gw:${current.id}`,
      dueAt: last + ALBUM_LIMIT_MS,
      absent: true,
    });
  }

  return due;
}

/** Which of them are late, reading only the marks that have actually fallen due. */
export async function overdue(env: ExpectationsEnv, catalog: Catalog, now = Date.now()): Promise<string[]> {
  const late: string[] = [];
  for (const expectation of expectationsFor(catalog, now)) {
    if (now < expectation.dueAt) continue;
    const mark = await env.TELEGRAM_STATE.get(expectation.mark);
    const wrong = expectation.absent ? mark !== null : mark === null;
    if (wrong) late.push(expectation.name);
  }
  return late;
}

/**
 * The whole point: the schedule notices its own gaps and says so, before anybody has to ask.
 *
 * Once an hour at most, and only ever to the maintainer's chat — the league group has no use
 * for this and eleven people cannot act on it.
 */
export async function checkExpectations(
  env: ExpectationsEnv,
  catalog: Catalog,
  now = Date.now(),
): Promise<{ alerted: boolean; late: string[] }> {
  const late = await overdue(env, catalog, now);
  if (!late.length) return { alerted: false, late };

  console.error(JSON.stringify({ event: "expectations_overdue", late }));
  const alerted = await alertOnce(
    env, "health:overdue",
    `⚠️ Farmisarja: nämä olisi pitänyt jo tapahtua — ${late.join(", ")}. Ajastin pyörii, joten vika on näissä eikä siinä.`,
    now,
  );
  return { alerted, late };
}
