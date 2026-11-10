import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isLiveUpdate, rowMotionOffsets, type LiveMotionFrame } from "./services/liveMotion";

export const LiveMotionContext = createContext<LiveMotionFrame>({ revision: "", scope: "", enabled: false, visible: true, live: false });
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  return visible;
}

export function LiveNumber({ value, format = String }: { value: number | null; format?: (value: number) => string }) {
  const frame = useContext(LiveMotionContext);
  const element = useRef<HTMLElement>(null);
  const previous = useRef<{ frame: LiveMotionFrame; value: number | null } | null>(null);
  const animation = useRef<Animation | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [roll, setRoll] = useState<number[] | null>(null);
  const timers = useRef<number[]>([]);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { frame, value };
    if (!old || old.frame.scope !== frame.scope || !frame.enabled || !frame.visible) {
      timers.current.forEach(window.clearTimeout); animation.current?.cancel(); setChange(null); setRoll(null); return;
    }
    if (!isLiveUpdate(old.frame, frame) || old.value === value || old.value == null || value === null) return;
    timers.current.forEach(window.clearTimeout);
    setChange(value - old.value);
    if (!reducedMotion()) {
      setRoll(Array.from({ length: 7 }, (_, i) => Math.round(old.value! + (value - old.value!) * i / 6)));
      timers.current.push(window.setTimeout(() => setRoll(null), 1900));
    }
    timers.current.push(window.setTimeout(() => setChange(null), 15000));
  }, [value, frame.revision, frame.scope, frame.enabled, frame.visible, frame.live]);
  useLayoutEffect(() => {
    animation.current?.cancel();
    const reel = element.current?.querySelector<HTMLElement>(".live-number-reel");
    if (!roll || !reel?.animate) return;
    animation.current = reel.animate([{ transform: "translateY(0)" }, { transform: `translateY(-${(roll.length - 1) * 100 / roll.length}%)` }], { duration: 1800, easing: "cubic-bezier(.16,.7,.15,1)", fill: "forwards" });
  }, [roll]);
  useEffect(() => () => { animation.current?.cancel(); timers.current.forEach(window.clearTimeout); }, []);
  const text = value === null ? "—" : format(value);
  return <strong ref={element} className={`live-number ${change === null ? "" : change > 0 ? "recent-up" : "recent-down"}`} aria-label={change === null ? text : `${text} (${change > 0 ? "+" : ""}${change})`}>
    <span className="live-number-window" aria-hidden="true">{roll ? <span className="live-number-reel">{roll.map((n, i) => <span key={i}>{format(n)}</span>)}</span> : text}</span>
    {change !== null && <small className="live-number-change" aria-hidden="true">{change > 0 ? "+" : "−"}{Math.abs(change)}</small>}
  </strong>;
}

export function useLiveRowMotion(frame: LiveMotionFrame, order: number[]) {
  const rows = useRef<HTMLDivElement>(null);
  const previous = useRef<{ frame: LiveMotionFrame; rows: Array<{ id: number; top: number }> } | null>(null);
  const animations = useRef<Animation[]>([]);
  const orderKey = order.join(",");
  useEffect(() => {
    const reset = () => { previous.current = null; animations.current.forEach((animation) => animation.cancel()); };
    window.addEventListener("resize", reset);
    return () => { window.removeEventListener("resize", reset); reset(); };
  }, []);
  useLayoutEffect(() => {
    const elements = [...(rows.current?.querySelectorAll<HTMLElement>(".manager-block[data-manager-id]") ?? [])];
    const origin = rows.current?.getBoundingClientRect().top ?? 0;
    const current = elements.map((element) => ({ id: Number(element.dataset.managerId), top: element.getBoundingClientRect().top - origin }));
    const old = previous.current;
    previous.current = { frame, rows: current };
    if (!isLiveUpdate(old?.frame ?? null, frame) || reducedMotion()) return;
    const offsets = rowMotionOffsets(old?.rows ?? [], current);
    if (!offsets.size) return;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = elements.flatMap((element) => {
      const offset = offsets.get(Number(element.dataset.managerId));
      return offset === undefined || !element.animate ? [] : [element.animate([
        { transform: `translateY(${offset}px)` }, { transform: "translateY(0)" },
      ], { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" })];
    });
  }, [frame.revision, frame.scope, frame.enabled, frame.visible, frame.live, orderKey]);
  return rows;
}

/** Retain the closing content until its measured-height transition finishes. */
export function SquadDisclosure({ open, children }: { open: boolean; children: ReactNode }) {
  const [present, setPresent] = useState(open);
  const [height, setHeight] = useState(0);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (open) setPresent(true); else setHeight(0); }, [open]);
  useLayoutEffect(() => {
    if (!open || !present || !inner.current) return;
    const element = inner.current;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, present]);
  useEffect(() => {
    if (open || !present) return;
    const timer = window.setTimeout(() => setPresent(false), 280);
    return () => window.clearTimeout(timer);
  }, [open, present]);
  return <div className={`squad-disclosure ${open ? "is-open" : ""}`} style={{ height }} aria-hidden={!open} inert={!open ? true : undefined}>
    <div ref={inner} className="squad-disclosure-inner">{present ? children : null}</div>
  </div>;
}
