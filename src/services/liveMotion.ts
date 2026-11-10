export interface LiveMotionFrame {
  revision: string;
  scope: string;
  enabled: boolean;
  visible: boolean;
  live: boolean;
}

/** Only a new, visible live snapshot in the same view can animate an existing value. */
export function isLiveUpdate(previous: LiveMotionFrame | null, current: LiveMotionFrame): boolean {
  return Boolean(previous && previous.enabled && current.enabled && previous.visible && current.visible
    && previous.scope === current.scope && previous.revision !== current.revision && (previous.live || current.live));
}

export function rowMotionOffsets(previous: Array<{ id: number; top: number }>, current: Array<{ id: number; top: number }>): Map<number, number> {
  if (previous.length !== current.length || previous.every((row, i) => row.id === current[i]?.id)) return new Map();
  const tops = new Map(previous.map((row) => [row.id, row.top]));
  if (current.some((row) => !tops.has(row.id))) return new Map();
  return new Map(current.map((row) => [row.id, tops.get(row.id)! - row.top] as const).filter(([, offset]) => Math.abs(offset) > 1));
}
