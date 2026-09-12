import { afterEach, describe, expect, it, vi } from "vitest";
import { checkExpectations, expectationsFor, overdue, type ExpectationsEnv } from "./expectations";
import { CATALOG_VERSION, type Catalog } from "./catalog";

/**
 * GW3 as it actually ran: deadline Friday evening, last kickoff Sunday half four.
 * Every case below is a gap that really happened and that only the owner noticed.
 */
const catalog: Catalog = {
  version: CATALOG_VERSION,
  builtAt: "2026-09-06T17:00:00Z",
  events: [
    { id: 3, deadline_time: "2026-09-04T17:30:00Z", is_current: true, is_next: false, finished: false, ranked_count: 10_000 },
    { id: 4, deadline_time: "2026-09-12T12:30:00Z", is_current: false, is_next: true, finished: false, ranked_count: 0 },
  ],
  teams: [],
  elements: [],
  fixtures: [
    { event: 3, kickoff: "2026-09-04T19:00:00Z" },
    { event: 3, kickoff: "2026-09-06T15:30:00Z" },
  ],
};

function testEnv(marks: string[] = []) {
  const state = new Map<string, string>(marks.map((key) => [key, "done"]));
  return {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_ALERT_CHAT_ID: "private-chat",
    TELEGRAM_STATE: {
      get: vi.fn(async (key: string, type?: string) => {
        const value = state.get(key) ?? null;
        return value !== null && type === "json" ? JSON.parse(value) : value;
      }),
      put: vi.fn(async (key: string, value: string) => { state.set(key, value); }),
      delete: vi.fn(async (key: string) => { state.delete(key); }),
    },
  } as unknown as ExpectationsEnv;
}

/** GW3's own reminders, which did go out — 4 Sep was the first week they both did. */
const remindersSent = ["deadline:3:24h", "deadline:3:2h"];
/** Everything GW3 owed, all of it done. */
const allDone = [...remindersSent, "deadline-card:gw:3", "postgame:gw:3"];
const at = (time: string) => Date.parse(time);

afterEach(() => vi.unstubAllGlobals());

describe("what the schedule owes", () => {
  it("does not call a thing late before it is due", async () => {
    // Twenty minutes after the last whistle the report is not late, it is being made.
    const env = testEnv([...remindersSent, "deadline-card:gw:3"]);
    expect(await overdue(env, catalog, at("2026-09-06T17:50:00Z"))).toEqual([]);
  });

  it("names the deadline card that could not get a turn", async () => {
    // 4 Sep: the rank sample held every tick for three hours and the card went unsent.
    const env = testEnv(remindersSent);
    expect(await overdue(env, catalog, at("2026-09-04T18:35:00Z"))).toEqual(["GW3 deadline-kortti"]);
  });

  it("names a reminder that never went", async () => {
    // The weekend at the cottage, where neither reminder arrived and nothing said so.
    const env = testEnv(["deadline:4:2h", "deadline-card:gw:3", "postgame:gw:3"]);
    expect(await overdue(env, catalog, at("2026-09-11T13:00:00Z"))).toContain("GW4 24h muistutus");
  });

  it("names a report that never got queued", async () => {
    const env = testEnv([...remindersSent, "deadline-card:gw:3"]);
    expect(await overdue(env, catalog, at("2026-09-06T20:00:00Z"))).toEqual(["GW3 loppuraportti"]);
  });

  it("names an album that stopped halfway, by the leftovers it did not clean up", async () => {
    // 31 Aug: the pair of images failed after the photo had gone and the job stayed behind.
    const env = testEnv([...allDone, "album:gw:3"]);
    expect(await overdue(env, catalog, at("2026-09-07T00:00:00Z"))).toEqual(["GW3 kuvat jumissa"]);
  });

  it("is silent when the album finished and cleaned up after itself", async () => {
    const env = testEnv(allDone);
    expect(await overdue(env, catalog, at("2026-09-07T00:00:00Z"))).toEqual([]);
  });

  it("reads only the marks that have fallen due", async () => {
    // The cost of this running twelve times an hour is the point: on a quiet Tuesday the
    // expectations are all in the future and it reads nothing at all.
    const env = testEnv();
    await overdue(env, catalog, at("2026-09-04T12:00:00Z"));
    const asked = (env.TELEGRAM_STATE.get as ReturnType<typeof vi.fn>).mock.calls.map(([key]) => key);
    expect(asked).not.toContain("postgame:gw:3");
    expect(asked).not.toContain("deadline-card:gw:3");
  });

  it("owes nothing it has no fixtures for, and lets last week's reminders go", () => {
    // Two days on, GW3's reminders are history and GW4's are the ones still owed. Without
    // fixtures there is no last kickoff, so neither report expectation can be dated.
    const bare = { ...catalog, fixtures: [] };
    expect(expectationsFor(bare, at("2026-09-06T20:00:00Z")).map((entry) => entry.mark))
      .toEqual(["deadline:4:24h", "deadline:4:2h", "deadline-card:gw:3"]);
  });
});

describe("telling somebody", () => {
  it("says it once per output even after the hourly gate expires", async () => {
    const env = testEnv(remindersSent);
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await checkExpectations(env, catalog, at("2026-09-04T18:35:00Z"));
    const second = await checkExpectations(env, catalog, at("2026-09-04T18:40:00Z"));

    expect(first.alerted).toBe(true);
    expect(second.alerted).toBe(false);
    await env.TELEGRAM_STATE.delete("health:overdue");
    const third = await checkExpectations(env, catalog, at("2026-09-04T19:40:00Z"));
    expect(third.alerted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("private-chat");
    expect(body.text).toContain("GW3 deadline-kortti");
  });

  it("still alerts for a different missing output after a previous alert", async () => {
    const env = testEnv(remindersSent);
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await checkExpectations(env, catalog, at("2026-09-04T18:35:00Z"));
    await env.TELEGRAM_STATE.delete("health:overdue");
    expect((await checkExpectations(env, catalog, at("2026-09-06T20:00:00Z"))).alerted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(body.text).toContain("loppuraportti");
    expect(body.text).not.toContain("deadline-kortti");
  });

  it("keeps an expired card visible in health without sending obsolete alerts", async () => {
    const env = testEnv(remindersSent);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkExpectations(env, catalog, at("2026-09-04T23:00:00Z")))
      .toEqual({ alerted: false, late: ["GW3 deadline-kortti"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not mark a rejected Telegram alert as notified and retries after the gate", async () => {
    const env = testEnv(remindersSent);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await checkExpectations(env, catalog, at("2026-09-04T18:35:00Z"))).alerted).toBe(false);
    expect(await env.TELEGRAM_STATE.get("health:overdue:notified")).toBeNull();
    await env.TELEGRAM_STATE.delete("health:overdue");
    expect((await checkExpectations(env, catalog, at("2026-09-04T19:40:00Z"))).alerted).toBe(true);
  });

  it("says nothing at all when everything has been delivered", async () => {
    const env = testEnv(allDone);
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await checkExpectations(env, catalog, at("2026-09-07T00:00:00Z"))).toEqual({ alerted: false, late: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
