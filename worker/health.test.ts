import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHeartbeat, writeHeartbeat, type HealthEnv } from "./health";

function testEnv(overrides: Record<string, unknown> = {}) {
  const state = new Map<string, string>();
  return {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "test-chat",
    TELEGRAM_STATE: {
      get: vi.fn(async (key: string, type?: string) => {
        const value = state.get(key) ?? null;
        return value !== null && type === "json" ? JSON.parse(value) : value;
      }),
      put: vi.fn(async (key: string, value: string) => { state.set(key, value); }),
    },
    ...overrides,
  } as unknown as HealthEnv;
}

const NOW = Date.parse("2026-08-30T14:30:00Z");
const telegramCalls = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.filter(([input]) => String(input).includes("api.telegram.org"));

afterEach(() => vi.unstubAllGlobals());

describe("the cron watchdog", () => {
  it("says nothing while the ticks are finishing", async () => {
    const env = testEnv();
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await writeHeartbeat(env, NOW - 9 * 60_000);

    expect(await checkHeartbeat(env, NOW)).toMatchObject({ alerted: false });
    expect(telegramCalls(fetchMock)).toHaveLength(0);
  });

  it("stays quiet over a single skipped beat, which Cloudflare does not promise to deliver", async () => {
    const env = testEnv();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    await writeHeartbeat(env, NOW - 20 * 60_000);

    expect(await checkHeartbeat(env, NOW)).toMatchObject({ alerted: false });
  });

  it("tells the chat when no tick has reached the end for half an hour", async () => {
    const env = testEnv();
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await writeHeartbeat(env, NOW - 30 * 60_000);

    expect(await checkHeartbeat(env, NOW)).toMatchObject({ alerted: true });
    const [, init] = telegramCalls(fetchMock)[0];
    expect(JSON.parse(String((init as RequestInit).body)).text).toContain("30 minuuttiin");
  });

  it("says it once an hour, not once a minute", async () => {
    const env = testEnv();
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await writeHeartbeat(env, NOW - 30 * 60_000);

    await checkHeartbeat(env, NOW);
    await checkHeartbeat(env, NOW + 60_000);

    expect(telegramCalls(fetchMock)).toHaveLength(1);
    expect(env.TELEGRAM_STATE.put).toHaveBeenCalledWith("health:alert", expect.any(String), expect.objectContaining({ expirationTtl: expect.any(Number) }));
  });

  it("marks the alert even when the chat could not be reached", async () => {
    // Otherwise an unreachable chat is a failed send on every tick of the outage.
    const env = testEnv();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("chat not found", { status: 400 })));
    await writeHeartbeat(env, NOW - 30 * 60_000);

    await checkHeartbeat(env, NOW);

    expect(env.TELEGRAM_STATE.put).toHaveBeenCalledWith("health:alert", expect.any(String), expect.anything());
  });

  it("does not cry outage over a Worker that has only just been deployed", async () => {
    const env = testEnv();
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await checkHeartbeat(env, NOW)).toEqual({ alerted: false, age: null });
    expect(telegramCalls(fetchMock)).toHaveLength(0);
  });
});
