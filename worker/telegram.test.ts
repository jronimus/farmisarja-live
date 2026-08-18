import { afterEach, describe, expect, it, vi } from "vitest";
import { checkTableReadyNotification } from "./telegram";

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
    },
    ...overrides,
  } as unknown as Env;
}

afterEach(() => vi.unstubAllGlobals());

describe("table-ready Telegram notification", () => {
  it("does not call external services while notifications are disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await checkTableReadyNotification(testEnv());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends once and records the gameweek after every entry has picks", async () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ events: [{ id: 1, deadline_time: pastDeadline, is_current: true, is_next: false }] }))
      .mockResolvedValueOnce(Response.json({ standings: { results: [] }, new_entries: { results: [{ entry: 11 }, { entry: 22 }] } }))
      .mockResolvedValueOnce(Response.json({ picks: [] }))
      .mockResolvedValueOnce(Response.json({ picks: [] }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });

    await checkTableReadyNotification(env);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(env.TELEGRAM_STATE.put).toHaveBeenCalledWith("table-ready:gw:1", expect.any(String));
  });
});
