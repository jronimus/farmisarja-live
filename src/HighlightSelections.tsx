import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Armchair, X } from "lucide-react";
import { highlightKey, selectionPoints, type HighlightSelection } from "./services/highlights";
import type { Language, ManagerRow } from "./types";
import "./highlightSelections.css";
export const highlightStyle = (color: string) => ({ "--selection-color": color } as CSSProperties);

export function SelectionPills({ selected, language, onRemove, onClear, liveCount }: { selected: HighlightSelection[]; language: Language; onRemove: (key: string) => void; onClear: () => void; liveCount?: number }) {
  return <div className="highlight-selection-pills" aria-label={language === "fi" ? "Valitut korostukset" : "Selected highlights"}><span className="highlight-selected-items">{liveCount !== undefined ? <span className="highlight-live-pill">Live · {liveCount}</span> : selected.map((item) => <span className="highlight-selection-pill" key={highlightKey(item.highlight)} style={highlightStyle(item.color)}><i aria-hidden="true" /><b>{item.label}</b><button aria-label={`${language === "fi" ? "Poista" : "Remove"} ${item.label}`} onClick={() => onRemove(highlightKey(item.highlight))}><X size={12} /></button></span>)}</span>{(selected.length > 0 || liveCount !== undefined) && <button type="button" className="highlight-selection-clear" onClick={onClear}>{language === "fi" ? "Poista kaikki" : "Clear all"}</button>}</div>;
}

export function ManagerSelectionMarks({ selected, manager, language, autosubs, includeBench, live = false }: { selected: HighlightSelection[]; manager: ManagerRow; language: Language; autosubs: boolean; includeBench: boolean; live?: boolean }) {
  const fi = language === "fi";
  const scores = selectionPoints(manager, selected, autosubs, includeBench);
  const entries = live ? [...scores.entries].sort((a, b) => (b.benched ? b.raw : b.points) - (a.benched ? a.raw : a.points) || a.selection.label.localeCompare(b.selection.label)) : scores.entries;
  const total = scores.total;
  const measureRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure) return;
    const update = () => {
      const children = Array.from(measure.children) as HTMLElement[];
      const widths = children.slice(0, entries.length).map((child) => child.getBoundingClientRect().width);
      setVisibleCount(fitSelectionMarks(widths, measure.parentElement!.clientWidth, children[entries.length].getBoundingClientRect().width, children[entries.length + 1].getBoundingClientRect().width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(measure.parentElement!);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [entries.length, entries.map((entry) => `${entry.points}:${entry.raw}:${entry.multiplier}`).join(","), total]);
  if (!selected.length) return null;
  const badges = entries.map(({ selection: item, points, raw, multiplier, benched }) => {
    const status = benched ? fi ? "Penkillä" : "Bench" : multiplier === 3 ? fi ? "Triplakapteeni" : "Triple captain" : multiplier === 2 ? fi ? "Kapteeni" : "Captain" : fi ? "Avaus" : "Starting";
    const label = `${item.label} · ${status} · ${benched ? raw : points} ${fi ? "pistettä" : "points"}${benched ? fi ? " · 0 joukkueelle" : " · 0 counted for team" : ""}`;
    return <span key={highlightKey(item.highlight)} className={`manager-selection-mark owned ${benched ? "benched" : ""} ${multiplier > 1 ? "captain" : ""} ${multiplier === 3 ? "triple" : ""}`} style={highlightStyle(item.color)} role="img" aria-label={label} title={label}>{benched && <Armchair size={12} />}<span className="selection-mark-score">{benched ? raw : points}</span></span>;
  });
  const hidden = Math.max(0, entries.length - visibleCount);
  const totalBadge = <b className="selection-points-total" title={fi ? "Valittujen pelaajien pisteet joukkueelle, kapteenikerroin mukana" : "Selected players' counted team points, including captain multipliers"}>= {total}<small>p</small></b>;
  return <span className="manager-selection-marks" aria-label={live ? "Live" : fi ? "Valittujen pelaajien pisteet" : "Selected players' points"}>
    <span className="selection-measure" ref={measureRef} aria-hidden="true">{badges}<span className="selection-overflow">+ {entries.length}×</span>{totalBadge}</span>
    {badges.slice(0, visibleCount)}{hidden > 0 && <span className="selection-overflow" title={entries.slice(visibleCount).map((entry) => entry.selection.label).join(", ")} aria-label={fi ? `${hidden} muuta valittua pelaajaa` : `${hidden} more selected players`}>+ {hidden}×</span>}{totalBadge}
  </span>;
}

/** Keep the total and overflow indicator visible within two lines at any column width. */
export function fitSelectionMarks(widths: number[], available: number, overflowWidth: number, totalWidth: number): number {
  for (let count = widths.length; count >= 0; count--) {
    const items = [...widths.slice(0, count), ...(count < widths.length ? [overflowWidth] : []), totalWidth];
    let row = 1;
    let used = 0;
    for (const width of items) {
      if (used && used + 3 + width > available) { row++; used = 0; }
      used += (used ? 3 : 0) + width;
    }
    if (row <= 2) return count;
  }
  return 0;
}
