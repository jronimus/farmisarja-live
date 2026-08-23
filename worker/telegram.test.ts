import { afterEach, describe, expect, it, vi } from "vitest";
import { deadlineRemaining, reminderIsDue, runTelegramSchedule, type TelegramEnv } from "./telegram";

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
});

describe("deadline card Telegram notification", () => {
  it("does not call external services while notifications are disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await runTelegramSchedule(testEnv());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends once and records the gameweek after every entry has picks", async () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ events: [{ id: 1, deadline_time: pastDeadline, is_current: true, is_next: false }] }))
      .mockResolvedValueOnce(Response.json({ standings: { results: [] }, new_entries: { results: [{ entry: 11 }, { entry: 22 }] } }))
      .mockResolvedValueOnce(Response.json({ picks: [] }))
      .mockResolvedValueOnce(Response.json({ picks: [] }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json([{ event: 1, finished: false }]));
    vi.stubGlobal("fetch", fetchMock);
    const env = testEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "true" });

    await runTelegramSchedule(env);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(env.TELEGRAM_STATE.put).toHaveBeenCalledWith("deadline-card:gw:1", expect.any(String));
  });

  it("formats the remaining deadline without seconds", () => {
    const now = Date.parse("2026-08-18T12:00:00Z");
    expect(deadlineRemaining({ id: 1, deadline_time: "2026-08-19T14:30:00Z", is_current: false, is_next: true }, now)).toBe("1 päivä 2 tuntia");
  });
});
