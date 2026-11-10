import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Fit complete rows to the available banner space without hiding ownership pills. */
export default function PlanningDenseRows({ rows, fit, className = "", count }: { rows: ReactNode[]; fit: boolean; className?: string; count?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(4);
  useLayoutEffect(() => {
    if (count !== undefined || !fit || !root.current || !measure.current) return;
    const list = root.current, sample = measure.current;
    const update = () => {
      let height = 0, count = 0;
      for (const row of Array.from(sample.children)) {
        height += row.getBoundingClientRect().height + (count ? 3 : 0);
        if (height > list.clientHeight) break;
        count++;
      }
      setLimit(Math.max(1, count));
    };
    const observer = new ResizeObserver(update);
    observer.observe(list); observer.observe(sample); update();
    return () => observer.disconnect();
  }, [fit, rows.length, count]);
  return <div className={`planning-dense-list ${fit ? "fitted" : ""} ${className}`} ref={root}>
    {fit && count === undefined && <div className="planning-dense-measure" ref={measure} aria-hidden="true" inert>{rows}</div>}
    {rows.slice(0, count ?? (fit ? limit : rows.length))}
  </div>;
}
