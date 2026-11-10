import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoData } from "./demoData";
import { livePlayerSelections } from "./services/highlights";
import LivePlayersModal from "./LivePlayersModal";
vi.mock("react-dom", () => ({ createPortal: (node: unknown) => node }));

describe("live player overview", () => {
  it("starts with league-owned players and offers the separate all-player view", () => {
    vi.stubGlobal("document", { querySelector: () => null, body: {} });
    try {
      const unowned = { ...demoData.managers[0].squad[0], id: 99999, name: "Unowned player", state: "live" as const };
      const data = { ...demoData, players: [unowned] };
      const selected = livePlayerSelections(data.managers);
      const html = renderToStaticMarkup(<LivePlayersModal data={data} selected={selected} language="fi" autosubs suspended={false} onClose={() => {}} onPlayer={() => {}} />);
      expect(html).not.toContain("Unowned player");
      expect(html).toContain("Kaikki pelaajat");
      expect(html.match(/class="live-match-group"/g)).toHaveLength(3);
      expect(html.match(/class="live-player-card"/g)).toHaveLength(selected.length);
      expect(html).toContain("MCI 2–0 ARS");
      expect(html).toContain(demoData.managers[0].teamName);
      expect(html).toContain(selected[0].color);
      const all = livePlayerSelections(data.managers, data.players);
      expect(all).toHaveLength(selected.length + 1);
      expect(all.find((item) => item.label === selected[0].label)?.color).toBe(selected[0].color);
    } finally { vi.unstubAllGlobals(); }
  });
});
