import { describe, expect, it, vi } from "vitest";

describe("shared article cache", () => {
  it("shares concurrent requests and reuses results for sidebar and news page", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_FPL_API_URL", "https://example.test/api");
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ articles: [{ id: "one" }], pressers: [] }) });
    vi.stubGlobal("fetch", fetch);
    try {
      const { loadArticles } = await import("./articles");
      await Promise.all([loadArticles(), loadArticles()]);
      await loadArticles();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith("https://example.test/articles");
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
});
