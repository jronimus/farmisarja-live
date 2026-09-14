import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceAlbum, captureCard, DEADLINE_CARD_WINDOW_MS, deadlineRemaining, reminderIsDue, runDeadlineReminders, runTelegramJobs, type TelegramEnv } from "./telegram";
import type { CatalogEvent } from "./catalog";

/** What the tick now hands the chat: the gameweek list, already parsed, out of the catalog. */
const events = (...list: Array<Partial<CatalogEvent> & { id: number; deadline_time: string }>): CatalogEvent[] =>
  list.map((event) => ({ is_current: false, is_next: false, finished: false, ranked_count: 0, ...event }));

function testEnv(overrides: Record<string, unknown> = {}) {
  const state = new Map<string, string>();
  return {
    FPL_LEAGUE_ID: "200068",
    PUBLIC_SITE_URL: "https://example.com/",
    TELEGRAM_NOTIFICATIONS_ENABLED: "false",
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "test-chat",
    TELEGRAM_STATE: {
      get: vi.fn(async (key: string) => state.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { state.set(key, value); }),
      delete: vi.fn(async (key: string) => { state.delete(key); }),
    },
    BROWSER: {
      quickAction: vi.fn(async () => {
        return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
      }),
    },
    ...overrides,
  } as unknown as TelegramEnv;
}

afterEach(() => vi.unstubAllGlobals());

describe("deadline reminder timing", () => {
  it("never sends before the target", () => {
    const target = 2 * 3_600_000;
    expect(reminderIsDue(target + 1, target)).toBe(false);
    expect(reminderIsDue(target, target)).toBe(true);
    expect(reminderIsDue(target - 2 * 60_000, target)).toBe(true);
  });

  it("still sends when the tick that should have caught it never ran", () => {
    // The five minute window this used to have meant a run of dropped ticks lost the
    // reminder for good. Late is the point: sendOnce is what stops it repeating.
    const target = 24 * 3_600_000;
    expect(reminderIsDue(target - 90 * 60_000, target)).toBe(true);
  });

  it("stops at the deadline itself", () => {
    expect(reminderIsDue(0, 2 * 3_600_000)).toBe(false);
    expect(reminderIsDue(-60_000, 2 * 3_600_000)).toBe(false);
  });
});

describe("deadline card Telegram notification", () => {
  it("waits for a ready card of the requested gameweek without waiting for network silence", async () => {
    const env = testEnv();
    await captureCard(env, "deadline", 0, 5);
    expect(env.BROWSER.quickAction).toHaveBeenCalledWith("screenshot", expect.objectContaining({
      selector: '.sc-card[data-ready="true"][data-gameweek="5"]',
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 15_000 },
      waitForSelector: { selector: '.sc-card[data-ready="true"][data-gameweek="5"]', visible: true, timeout: 25_000 },
    }));
  });

  it("does not fetch or send an expired deadline card, even without a sent receipt", async () => {
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });
    await env.TELEGRAM_STATE.put("postgame:gw:4", "sent");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const deadline = Date.parse("2026-09-12T12:30:00Z");
    await runTelegramJobs(env, events({ id: 4, deadline_time: new Date(deadline).toISOString(), is_current: true }), deadline + DEADLINE_CARD_WINDOW_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(env.BROWSER.quickAction).not.toHaveBeenCalled();
    expect(await env.TELEGRAM_STATE.get("deadline-card:gw:4")).toBeNull();
  });

  it("retries a failed capture on the next turn and sends only once after recovery", async () => {
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });
    await env.TELEGRAM_STATE.put("postgame:gw:5", "sent");
    vi.mocked(env.BROWSER.quickAction).mockResolvedValueOnce(new Response("timeout", { status: 422 }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("standings")) return Response.json({ standings: { results: [{ entry: 11 }] } });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const deadline = Date.parse("2026-09-19T10:00:00Z");
    const list = events({ id: 5, deadline_time: new Date(deadline).toISOString(), is_current: true });
    await runTelegramJobs(env, list, deadline + 60_000);
    expect(await env.TELEGRAM_STATE.get("deadline-card:gw:5")).toBeNull();
    await runTelegramJobs(env, list, deadline + 11 * 60_000);
    await runTelegramJobs(env, list, deadline + 21 * 60_000);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("sendPhoto"))).toHaveLength(1);
    expect(await env.TELEGRAM_STATE.get("deadline-card:gw:5")).not.toBeNull();
  });
  it("does not call external services while notifications are disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await runTelegramJobs(testEnv(), events({ id: 1, deadline_time: new Date().toISOString(), is_current: true }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends once and records the gameweek after every entry has picks", async () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ standings: { results: [] }, new_entries: { results: [{ entry: 11 }, { entry: 22 }] } }))
      .mockResolvedValueOnce(Response.json({ picks: [] }))
      .mockResolvedValueOnce(Response.json({ picks: [] }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json([{ event: 1, finished: false }]));
    vi.stubGlobal("fetch", fetchMock);
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });

    await runTelegramJobs(env, events({ id: 1, deadline_time: pastDeadline, is_current: true }));

    // No bootstrap among them: the gameweek arrived already parsed.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.every(([input]) => !String(input).includes("bootstrap-static"))).toBe(true);
    expect(env.TELEGRAM_STATE.put).toHaveBeenCalledWith("deadline-card:gw:1", expect.any(String), expect.objectContaining({ expirationTtl: expect.any(Number) }));
  });

  it("reads the mark before the league, so a sent card costs nothing on a turn", async () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });
    await env.TELEGRAM_STATE.put("deadline-card:gw:1", "sent");
    await env.TELEGRAM_STATE.put("postgame:gw:1", "sent");

    await runTelegramJobs(env, events({ id: 1, deadline_time: pastDeadline, is_current: true }));

    // Not a single request: no standings, no picks, no fixture list.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps one unreachable chat from silencing the rest of the schedule", async () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.telegram.org")) return new Response("chat not found", { status: 400 });
      if (url.includes("standings")) return Response.json({ standings: { results: [] }, new_entries: { results: [] } });
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });
    await env.TELEGRAM_STATE.put("album:preview", JSON.stringify({ chat: "private-chat", done: ["round", "total"] }));
    const list = events(
      { id: 1, deadline_time: pastDeadline, is_current: true },
      // Ninety minutes out, so the two-hour reminder is due and its send is what fails.
      { id: 2, deadline_time: new Date(Date.now() + 90 * 60_000).toISOString(), is_next: true },
    );

    await expect(runDeadlineReminders(env, list)).resolves.toBeUndefined();
    await expect(runTelegramJobs(env, list)).resolves.toBeUndefined();

    // The reminder's send threw, and the album someone asked for in another chat still ran.
    expect(env.BROWSER.quickAction).toHaveBeenCalled();
  });

  it("formats the remaining deadline without seconds", () => {
    const now = Date.parse("2026-08-18T12:00:00Z");
    expect(deadlineRemaining(events({ id: 1, deadline_time: "2026-08-19T14:30:00Z" })[0], now)).toBe("1 päivä 2 tuntia");
  });
});

describe("the post-game report, when Telegram takes the first message and refuses the second", () => {
  const banked = async (env: TelegramEnv) => {
    await env.TELEGRAM_STATE.put("album:gw:2", JSON.stringify({ chat: "group", done: ["round", "total", "awards"] }));
    for (const kind of ["round", "total", "awards"]) await env.TELEGRAM_STATE.put(`album:gw:2:${kind}`, "png-bytes");
  };
  const method = (input: RequestInfo | URL) => String(input).split("/").pop();

  it("does not send the photo a second time when the pair has to be retried", async () => {
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });
    await banked(env);

    // The failure that actually happened: the photo lands, the pair does not.
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      method(input) === "sendMediaGroup" ? new Response("Too Many Requests", { status: 429 }) : Response.json({ ok: true })));
    await advanceAlbum(env, "album:gw:2");
    expect(vi.mocked(fetch).mock.calls.map(([input]) => method(input))).toEqual(["sendPhoto"]);
    await expect(advanceAlbum(env, "album:gw:2")).rejects.toThrow(/sendMediaGroup/);

    // The photo that landed is written down, so the retry cannot repeat it.
    const stored = JSON.parse(await env.TELEGRAM_STATE.get("album:gw:2") as unknown as string);
    expect(stored.sent).toEqual(["photo"]);

    const second = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", second);
    await advanceAlbum(env, "album:gw:2");

    expect(second.mock.calls.map(([input]) => method(input))).toEqual(["sendMediaGroup"]);
    expect(await env.TELEGRAM_STATE.get("album:gw:2")).toBeNull();
    expect(await env.TELEGRAM_STATE.get("album:gw:2:delivered")).not.toBeNull();
  });

  it("uploads JPEG parts with their real MIME type and keeps older PNG parts readable", async () => {
    const env = testEnv();
    await banked(env);
    const get = vi.mocked(env.TELEGRAM_STATE.get).getMockImplementation()!;
    vi.mocked(env.TELEGRAM_STATE.get).mockImplementation(async (key: string, type?: unknown) => {
      if (type === "arrayBuffer") return new Uint8Array(key.endsWith(":total") ? [137, 80, 78, 71] : [255, 216, 255]).buffer;
      return get(key);
    });
    const calls: FormData[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      calls.push(init.body as FormData);
      return Response.json({ ok: true });
    }));
    await advanceAlbum(env, "album:gw:2");
    expect((calls[0].get("photo") as Blob).type).toBe("image/jpeg");
    expect(await env.TELEGRAM_STATE.get("album:gw:2:delivered")).toBeNull();
    await advanceAlbum(env, "album:gw:2");
    expect((calls[1].get("file0") as Blob).type).toBe("image/png");
    expect((calls[1].get("file1") as Blob).type).toBe("image/jpeg");
  });

  it("banks a capture before anything is sent", async () => {
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });
    await env.TELEGRAM_STATE.put("album:gw:2", JSON.stringify({ chat: "group", done: ["round", "total"] }));
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await advanceAlbum(env, "album:gw:2");

    // The last card used to be taken and sent in one breath, so a refused send threw the
    // screenshot away with it.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(await env.TELEGRAM_STATE.get("album:gw:2") as unknown as string).done).toHaveLength(3);
  });
});
