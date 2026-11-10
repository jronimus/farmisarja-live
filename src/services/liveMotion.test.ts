import { describe, expect, it } from "vitest";
import { isLiveUpdate, rowMotionOffsets, type LiveMotionFrame } from "./liveMotion";
const frame = (extra: Partial<LiveMotionFrame> = {}): LiveMotionFrame => ({ revision: "2", scope: "table:total", enabled: true, visible: true, live: true, ...extra });
describe("live score motion", () => {
  it("animates later live snapshots, including the final correction", () => {
    expect(isLiveUpdate(frame({ revision: "1" }), frame())).toBe(true);
    expect(isLiveUpdate(frame({ revision: "1" }), frame({ live: false }))).toBe(true);
  });
  it("does not animate initial load, ordinary rerenders or manual view changes", () => {
    expect(isLiveUpdate(null, frame())).toBe(false);
    expect(isLiveUpdate(frame(), frame())).toBe(false);
    expect(isLiveUpdate(frame({ revision: "1", enabled: false }), frame())).toBe(false);
    expect(isLiveUpdate(frame({ revision: "1" }), frame({ scope: "table:month" }))).toBe(false);
    expect(isLiveUpdate(frame({ revision: "1", live: false }), frame({ live: false }))).toBe(false);
  });
  it("suppresses background, restored-tab and disabled-view updates", () => {
    expect(isLiveUpdate(frame({ revision: "1" }), frame({ visible: false }))).toBe(false);
    expect(isLiveUpdate(frame({ revision: "1", visible: false }), frame())).toBe(false);
    expect(isLiveUpdate(frame({ revision: "1" }), frame({ enabled: false }))).toBe(false);
  });
  it("moves reordered rows by their actual heights and ignores expansion without a reorder", () => {
    const old = [{ id: 1, top: 10 }, { id: 2, top: 90 }, { id: 3, top: 370 }];
    expect([...rowMotionOffsets(old, [{ id: 2, top: 10 }, { id: 1, top: 290 }, { id: 3, top: 370 }])]).toEqual([[2, 80], [1, -280]]);
    expect(rowMotionOffsets(old, [{ id: 1, top: 10 }, { id: 2, top: 400 }, { id: 3, top: 680 }]).size).toBe(0);
    expect(rowMotionOffsets([], old).size).toBe(0);
    expect(rowMotionOffsets(old, [{ id: 4, top: 10 }, { id: 2, top: 90 }, { id: 3, top: 370 }]).size).toBe(0);
  });
});
